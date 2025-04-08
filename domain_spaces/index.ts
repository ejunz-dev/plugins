import { load } from 'js-yaml';
import { Dictionary } from 'lodash';
import moment from 'moment-timezone';
import {
    CannotDeleteSystemDomainError, DomainJoinAlreadyMemberError, DomainJoinForbiddenError, ForbiddenError,
    InvalidJoinInvitationCodeError, OnlyOwnerCanDeleteDomainError, PermissionError, RoleAlreadyExistError, ValidationError,
} from 'ejun';
import type { DomainDoc } from 'ejun';
import { PERM, PERMS_BY_FAMILY, PRIV,SettingModel } from 'ejun';
import * as discussion from 'ejun';
import {
    Handler, param, post, query, requireSudo, Types,domain,Context,DomainModel,OplogModel,SystemModel
} from 'ejun';
import { log2 } from 'ejun'
import yaml from 'js-yaml';
import _ from 'lodash';
import fs from 'fs';

interface ResultItem {
    name: string;
    Systemallowed: any;
}

async function SystemChecker(domainId: string, spaceName: string) {
    const SystemSettings = SettingModel.SYSTEM_SETTINGS.filter(s => 
        s.family === 'system_spaces' && s.name === spaceName
    );
    const resultArray: ResultItem[] = [];

    for (const s of SystemSettings) {
        const name = s.name;
        const SystemCurrentspacesArray = await SystemModel.get(s.key);
        const Current = yaml.load(SystemCurrentspacesArray);
        
        const result: ResultItem = {
            name: name,
            Systemallowed: Current
        };
        resultArray.push(result);
    }

    const hasAccess = resultArray.some(item => item.Systemallowed.includes(domainId));
    console.log(`Access for ${spaceName} in ${domainId} by SYSTEM`, hasAccess);
    return hasAccess;
}
async function DomainChecker(DomainId: string, spaceName: string) {
    const DomainCurrentspaces = await DomainModel.get(DomainId);
    const spaces = DomainCurrentspaces?.spaces;

    const hasAccess = spaces ? spaces.includes(spaceName) : false;
    console.log(`Access for ${spaceName} in ${DomainId} by DOMAIN`, hasAccess);
    return hasAccess;
}

async function checkAccess(domainId: string, spaceName: string) {
    const hasSystemAccess = await SystemChecker(domainId, spaceName);
    const hasDomainAccess = await DomainChecker(domainId, spaceName);

    const hasAccess = hasSystemAccess && hasDomainAccess;
    console.log(`Ultimate Access for ${spaceName} in domain ${domainId}:`, hasAccess);
    return hasAccess;
}

function set(key: string, value: any) {
    if (SettingModel.SYSTEM_SETTINGS_BY_KEY[key]) {
        const s = SettingModel.SYSTEM_SETTINGS_BY_KEY[key];
        if (s.flag & SettingModel.FLAG_DISABLED) return undefined;
        if ((s.flag & SettingModel.FLAG_SECRET) && !value) return undefined;
        if (s.type === 'boolean') {
            if (value === 'on') return true;
            return false;
        }
        if (s.type === 'number') {
            if (!Number.isSafeInteger(+value)) throw new ValidationError(key);
            return +value;
        }
        if (s.subType === 'yaml') {
            try {
                yaml.load(value);
            } catch (e) {
                throw new ValidationError(key);
            }
        }
        return value;
    }
    return undefined;
}

class ManageHandler extends Handler {
    async prepare({ domainId }) {
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
        this.domain = await DomainModel.get(domainId);
    }
}
class SystemHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }
}   
class SystemSpaceHandler extends SystemHandler {
    @requireSudo
    async get() {
        this.response.template = 'manage_spaces.html';
        this.response.body.current = {};
        this.response.body.settings = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_spaces');
        for (const s of this.response.body.settings) {
            this.response.body.current[s.key] = SystemModel.get(s.key);
        }
    }

    @requireSudo
    async post(args: any) {
        const tasks = [];
        const booleanKeys = args.booleanKeys || {};
        delete args.booleanKeys;
        for (const key in args) {
            if (typeof args[key] === 'object') {
                for (const subkey in args[key]) {
                    const val = set(`${key}.${subkey}`, args[key][subkey]);
                    if (val !== undefined) {
                        tasks.push(SystemModel.set(`${key}.${subkey}`, val));
                    }
                }
            }
        }
        for (const key in booleanKeys) {
            if (typeof booleanKeys[key] === 'object') {
                for (const subkey in booleanKeys[key]) {
                    if (!args[key]?.[subkey]) tasks.push(SystemModel.set(`${key}.${subkey}`, false));
                }
            }
        }
        await Promise.all(tasks);
        this.ctx.broadcast('system/setting', args);
        this.back();
    }
}

class DomainSpacePermissionsHandler extends ManageHandler {
   // @requireSudo
    async get({ domainId }) {
        const roles = await DomainModel.getRoles(domainId);
        const D = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_spaces');
        const T = D.filter(s => s.key.includes('spaces_allowed_domains'));
      
        const Bannedspaces: string[] = [];
        const Allowedspaces: string[] = [];
        for (const s of T) {
            const systemspacesKey = await SystemModel.get(s.key);
            const systemspacesName = s.name;
            const systemspacesMap = {}; 
            systemspacesMap[systemspacesName] = systemspacesKey;

            if (!systemspacesMap[systemspacesName].includes(domainId)) {
                const bannedspaces = systemspacesName;
                Bannedspaces.push(bannedspaces);
            } else {
                const allowedspaces = systemspacesName;
                Allowedspaces.push(allowedspaces);

                const hasAccess = await DomainChecker(domainId, allowedspaces);
                if (!hasAccess) {
                    Bannedspaces.push(allowedspaces);
                }
            }
        }

        let NEW_PERMS_BY_FAMILY = { ...PERMS_BY_FAMILY };

        if (Bannedspaces.length > 0) {
            for (const bannedSpace of Bannedspaces) {
                for (const Type in NEW_PERMS_BY_FAMILY) {
                    NEW_PERMS_BY_FAMILY[Type] = NEW_PERMS_BY_FAMILY[Type].filter(permission => permission.name !== bannedSpace);
                }
            }
        } else {
            NEW_PERMS_BY_FAMILY = PERMS_BY_FAMILY;
        }
        console.log('Bannedspaces',Bannedspaces);
        console.log('NEW_PERMS_BY_FAMILY',NEW_PERMS_BY_FAMILY);

        this.response.template = 'domain_spaces_permissions.html';
        this.response.body = {
            roles,
            NEW_PERMS_BY_FAMILY,
            domain: this.domain,
            log2,
        };
    }

    // @requireSudo
    async post({ domainId }) {
        const roles = {};
        for (const role in this.request.body) {
            const perms = this.request.body[role] instanceof Array
                ? this.request.body[role]
                : [this.request.body[role]];
            roles[role] = 0n;
            for (const r of perms) roles[role] |= 1n << BigInt(r);
        }
        await Promise.all([
            DomainModel.setRoles(domainId, roles),
            OplogModel.log(this, 'domain.setRoles', { roles }),
        ]);
        this.back();
    }
}

class DomainSpaceConfigHandler extends ManageHandler {
    async get({ domainId }) {
        const spacename = yaml.load(this.domain.spaces) as string[];
        const spacenameColumnsections: { [key: string]: string[] } = {};
        const defaultColumnsections: string[] = [];

        if (!spacename) {
            console.warn('spaces is undefined, using default empty array.');
            spacename = [];
        }
        for (const s of spacename) {
            const spacePath = `/root/Dev/ejunz/plugins/${s}/templates`;
            //TODO dynamic import path

            const spacefiles = fs.readdirSync(spacePath).filter(file => 
                !file.includes('space') && !file.endsWith('_main.html')
            ).map(file => file.replace(/\.html$/, ''));
            
            spacenameColumnsections[s] = spacefiles;
            
        }
        const defaultPath = `/root/Dev/ejunz/packages/ui-default/templates/partials/default`;
        const defaultfiles = fs.readdirSync(defaultPath).filter(file => 
            !file.includes('space') && !file.endsWith('_main.html')
        ).map(file => file.replace(/\.html$/, ''));
        defaultColumnsections.push(defaultfiles);

        let spaces = this.domain.spaces;
        if (!spaces) {
            console.warn('spaces is undefined, using default empty array.');
            spaces = '[]';
        }

        let spacesArray: string[] = [];

        try {
            const parsed = yaml.load(spaces);
            if (Array.isArray(parsed)) {
                spacesArray = parsed;
            } else {
                throw new Error('Parsed allowedspaces is not an array');
            }
        } catch (error) {
            console.error('Error parsing allowedspaces:', error);
            spacesArray = []; 
        }
            const spacesetting = SettingModel.DOMAIN_SPACE_CONFIG_SETTINGS;
            const settingsMap = new Map(
                spacesetting.map(s => {
                    const keyPrefix = s.key.split('_')[0];
                    return [keyPrefix, s];
                })
            );
            console.log('settingsMap', settingsMap);
            let completespacesettings = await Promise.all(spacesArray.map(async (spaceName) => {
                if (settingsMap.has(spaceName)) {
                    const spaceSettings = settingsMap.get(spaceName);
                    
                    const hasAccess = await checkAccess(domainId, spaceName);
                    
                    if (hasAccess) {
                        return {
                            ...spaceSettings,
                        };
                    } else {
                        console.warn(`No access for space: ${spaceName}`);
                        return null;
                    }
                } else {
                    console.warn(`No settings found for space: ${spaceName}`);
                    return null;
                }
            }));
            
            completespacesettings = completespacesettings.filter(setting => setting !== null);
            
            console.log(completespacesettings);
        this.response.template = 'domain_spaces_config.html';
        this.response.body.current = this.domain;
        this.response.body.settings = completespacesettings;
        this.response.body.spacenameColumnsections = spacenameColumnsections;
        this.response.body.defaultColumnsections = defaultColumnsections;

    }
    async post(args) {
        console.log('DOMAIN_SPACE_CONFIG_SETTINGS', SettingModel.DOMAIN_SPACE_CONFIG_SETTINGS);
        console.log('args', args);
        
        if (args.operation) return;
        const $set = {};

        for (const key in args) {
            const setting = SettingModel.DOMAIN_SPACE_CONFIG_SETTINGS.find(s => s.key === key);
            if (setting) {
                $set[key] = args[key];
            }
        }

        console.log('$set', $set);
        console.log('args.domainId', args.domainId);

        await DomainModel.edit(args.domainId, $set);
        this.response.redirect = this.url('domain_spaces_config');
    }
}

class DomainSpaceStoreHandler extends ManageHandler {
    async get({ domainId }) {
        const T = SettingModel.SYSTEM_SETTINGS.filter(s => s.key.endsWith('.spaces_allowed_domains'));
        const keynameArray = T.map(s => 
            ({
                key: s.key,
                name: s.name
            })
        );
        const allowedDomainsSetting = keynameArray.map(obj => ({
            key: obj.key,
            value: this.ctx.setting.get(obj.key),
            name: obj.name
        }));

        const domainspacesStore = allowedDomainsSetting.reduce((acc, setting) => {
            const allowedDomains = yaml.load(setting.value) as string[] || [];
            if (Array.isArray(allowedDomains) && allowedDomains.includes(domainId)) {
                acc.push(setting.name);
            }
            return acc;
        }, []);

        this.response.template = 'domain_spaces_store.html';
        this.response.body.current = this.domain;
        this.response.body.settings = SettingModel.DOMAIN_SPACE_CONFIG_SETTINGS.filter(s => s.family === 'setting_domain_on_spaces');
        // for (const s of this.response.body.settings) {
        //     this.response.body.current[s.key] = DomainModel.get(s.key);
        // }
        this.response.body.domainspacesStore = domainspacesStore;
     
    }
    async post(args) {
        if (args.operation) return;
        const $set = {};
        for (const key in args) {
            if (SettingModel.DOMAIN_SPACE_CONFIG_SETTINGS_BY_KEY[key]) $set[key] = args[key];
        }
        await DomainModel.edit(args.domainId, $set);
        this.response.redirect = this.url('domain_spaces_store');
    }
}
class DomainSpacePluginHandler extends ManageHandler {
    async get({ domainId }) {

        let spaces = this.domain.spaces;
        if (!spaces) {
            console.warn('spaces is undefined, using default empty array.');
            spaces = '[]';
        }

        let spacesArray: string[] = [];

        try {
            const parsed = yaml.load(spaces);
            if (Array.isArray(parsed)) {
                spacesArray = parsed;
            } else {
                throw new Error('Parsed allowedspaces is not an array');
            }
        } catch (error) {
            console.error('Error parsing allowedspaces:', error);
            spacesArray = []; 
        }
            const spacesetting = SettingModel.DOMAIN_SPACE_PLUGIN_SETTINGS;
            const settingsMap = new Map(
                spacesetting.map(s => {
                    const keyPrefix = s.key.split('_')[0];
                    return [keyPrefix, s];
                })
            );
            console.log('settingsMap', settingsMap);
            let completespacesettings = await Promise.all(spacesArray.map(async (spaceName) => {
                if (settingsMap.has(spaceName)) {
                    const spaceSettings = settingsMap.get(spaceName);
                    
                    const hasAccess = await checkAccess(domainId, spaceName);
                    
                    if (hasAccess) {
                        return {
                            ...spaceSettings,
                        };
                    } else {
                        console.warn(`No access for space: ${spaceName}`);
                        return null;
                    }
                } else {
                    console.warn(`No settings found for space: ${spaceName}`);
                    return null;
                }
            }));
            
            completespacesettings = completespacesettings.filter(setting => setting !== null);
            
            console.log(completespacesettings);
        this.response.template = 'domain_spaces_plugin.html';
        this.response.body.current = this.domain;
        this.response.body.settings = completespacesettings;


    }
    async post(args) {
        console.log('DOMAIN_SPACE_PLUGIN_SETTINGS', SettingModel.DOMAIN_SPACE_PLUGIN_SETTINGS);
        console.log('args', args);
        
        if (args.operation) return;
        const $set = {};

        for (const key in args) {
            const setting = SettingModel.DOMAIN_SPACE_PLUGIN_SETTINGS.find(s => s.key === key);
            if (setting) {
                $set[key] = args[key];
            }
        }

        console.log('$set', $set);
        console.log('args.domainId', args.domainId);

        await DomainModel.edit(args.domainId, $set);
        this.response.redirect = this.url('domain_spaces_plugin');
    }
}



export async function apply(ctx: Context) {
    global.Ejunz.ui.inject('DomainManage', 'domain_spaces_store', { family: 'spaces', icon: 'book' });
    global.Ejunz.ui.inject('DomainManage', 'domain_spaces_permissions', { family: 'spaces', icon: 'book' });
    global.Ejunz.ui.inject('DomainManage', 'domain_spaces_config', { family: 'spaces', icon: 'book' });
    global.Ejunz.ui.inject('DomainManage', 'domain_spaces_plugin', { family: 'spaces', icon: 'book' });
    global.Ejunz.ui.inject('NavDropdown', 'manage_spaces', { prefix: 'manage' }, PRIV.PRIV_EDIT_SYSTEM);

    ctx.Route('manage_spaces', '/manage/spaces', SystemSpaceHandler);
    ctx.Route('domain_spaces_permissions', '/domain/spaces/permissions', DomainSpacePermissionsHandler);
    ctx.Route('domain_spaces_config', '/domain/spaces/config', DomainSpaceConfigHandler);
    ctx.Route('domain_spaces_store', '/domain/spaces/store', DomainSpaceStoreHandler);
    ctx.Route('domain_spaces_plugin', '/domain/spaces/plugin', DomainSpacePluginHandler);

    ctx.i18n.load('zh', {
        'spaces': '本域空间',
        domain_spaces: '管理空间',
        manage_spaces: '系统空间',
        domain_spaces_permissions: '空间权限',
        domain_spaces_config: '空间配置',
        domain_spaces_store: '空间商店',
        domain_spaces_plugin: '空间插件',
    });

    ctx.injectUI('Home_Domain', 'domain_spaces', (h) => ({
        icon: 'book',
        displayName: '空间',
        uid: h.domain._id.toString()
        
    }));
    
    ctx.injectUI('ControlPanel', 'manage_spaces', (h) => ({}));

    ctx.on('handler/before/SystemSpace#post', (h) => {
        const systemspaces = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_spaces');
        for (const s of systemspaces) {
            const beforeSystemSpace = SystemModel.get(s.key);
            const parsedBeforeSystemSpace = yaml.load(beforeSystemSpace);
            h.initialState = h.initialState || {};
            h.initialState[s.key] = parsedBeforeSystemSpace || [];
        }
    });
    ctx.on('handler/after/SystemSpace#post', async (h) => {
        const systemspaces = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_spaces');
        for (const s of systemspaces) {
            const afterSystemSpace = SystemModel.get(s.key);
            const parsedAfterSystemSpace = yaml.load(afterSystemSpace);
            const initialState = h.initialState && h.initialState[s.key];

            if (initialState) {
                const updateDomains = _.differenceWith(initialState as any[], parsedAfterSystemSpace as any[], _.isEqual);

                if (updateDomains.length > 0) {
                    console.log(` ${s.name} has update domains: ${updateDomains}`, {
                        updateDomains: updateDomains
                    });
                    const Spacename = s.name;
                    const spacesPerm = PERMS_BY_FAMILY['spaces'];
                    const PermToremove = spacesPerm.filter(permission => permission.name === Spacename);
                    const targetDomains = updateDomains
                    for (const domain of targetDomains) {
                        const domainRoles: any = await DomainModel.getRoles(domain);
                        const updatedDomainRoles: { [key: string]: string } = {};
                        for (const role in domainRoles) {
                            if (domainRoles[role]._id === 'root') {
                                console.log('root role:', domainRoles[role]);
                                continue; 
                            }
                            let currentPerms = BigInt(domainRoles[role].perm);
                            for (const perm of PermToremove) {
                                currentPerms &= ~BigInt(perm.key);
                            }
                            updatedDomainRoles[domainRoles[role]._id] = currentPerms.toString();
                        }
                        await DomainModel.setRoles(domain, updatedDomainRoles);
                    }
                }
            }
        }
    });

    ctx.on('handler/before/DomainSpaceStore#post', async (h) => {
        const domainspaces = SettingModel.DOMAIN_SPACE_CONFIG_SETTINGS.filter(s => s.family === 'setting_domain_on_spaces');
        for (const s of domainspaces) {
            const before = await DomainModel.get(h.domain._id);
            const beforespaces = before?.spaces;
            let parsedBeforespaces : string[] = [];
        if (beforespaces) {
            parsedBeforespaces = yaml.load(beforespaces) as string[];
        } else {
            parsedBeforespaces = [];
        }
        h.initialState = h.initialState || {};
        h.initialState['spaces'] = parsedBeforespaces;
        }
  
    });

    ctx.on('handler/after/DomainSpaceStore#post', async (h) => {
        const domainspaces = SettingModel.DOMAIN_SPACE_CONFIG_SETTINGS.filter(s => s.family === 'setting_domain_on_spaces');
        for (const s of domainspaces) {
        const after = await DomainModel.get(h.domain._id);
        const afterspaces = after?.spaces;
        let parsedAfterspaces: string[] = [];

        if (afterspaces) {
            parsedAfterspaces = yaml.load(afterspaces) as string[];

        } else {
            parsedAfterspaces = [];
        }
        const initialState = h.initialState && h.initialState[s.key];


        if (initialState) {
            const removed = _.differenceWith(initialState as any[], parsedAfterspaces as any[], _.isEqual);

            if (removed.length > 0) {
                console.log(`Removed domains: ${removed.join(', ')}`, {
                    removed: removed
                });
                const Spacename = removed;
                const spacesPerm = PERMS_BY_FAMILY['spaces'];
                const PermToremove = spacesPerm.filter(permission => permission.name.includes(Spacename));
                for (const role in h.domain.roles) {
                    let currentPerms = BigInt(h.domain.roles[role]); 
                    for (const perm of PermToremove) {
                        currentPerms &= ~BigInt(perm.key);
                    }
                    h.domain.roles[role] = currentPerms.toString();
                    await DomainModel.setRoles(h.domain._id, h.domain.roles);
                }
            }
        }
    }


    });


    ctx.on('handler/after', (h) => {
        // TODO 添加system限制检查
        const availableSpaces = h.domain.spaces;
        const availableSpacesArray = yaml.load(availableSpaces) as string[];
        console.log('availableSpacesArray', availableSpacesArray);
        for (const space of availableSpacesArray) {
            const spaceConfig = h.domain[`${space}_plugin`];

            if (!spaceConfig) {
                console.warn(`spaceConfig for ${space} is undefined`);
                continue;
            }

            let spacePluginConfig;
            try {
                spacePluginConfig = yaml.load(spaceConfig) as any;
            } catch (error) {
                console.error(`Failed to parse spaceConfig for ${space}:`, error);
                continue;
            }

            console.log('spacePluginConfig', spacePluginConfig);

            if (!spacePluginConfig || !spacePluginConfig[space]) {
                console.warn(`spacePluginConfig or ${space} for ${space} is invalid`);
                continue;
            }

            const pluginRoutes = spacePluginConfig[space].map((item: any) => item.route);
            
            const spaceDefaultRoute = `/${space}`;
            console.log('spaceDefaultRoute', spaceDefaultRoute);

            pluginRoutes.push(spaceDefaultRoute);

            const overrideNav = spacePluginConfig[space].map((item: any) => ({
                name: item.name,
                args: {},
                checker: () => true
            }));

            console.log('pluginRoutes', pluginRoutes);
            console.log('overrideNav', overrideNav);

            if (pluginRoutes.some(route => h.request.path.includes(route))) {
                if (!h.response.body.overrideNav) {
                    h.response.body.overrideNav = [];
                }
                h.UiContext.spacename = spacePluginConfig[space].find((item: any) => h.request.path.includes(item.route))?.name || space;
                console.log('h.UiContext.spacename', h.UiContext.spacename);

                h.response.body.overrideNav.push(...overrideNav);
            }
        }
        console.log('h.response.body.overrideNav', h.response.body.overrideNav);
    });
   
    ctx.on('handler/after', (h) => {
        const spaceName = h.domain.spaces;
        const spaceNameArray = yaml.load(spaceName) as string[];
        for (const space of spaceNameArray) {
            console.log('space', space);
        }
    });

    // ctx.on('handler/after', (h) => {
    //     const spaceName = h.domain.spaces;
    //     const spaceNameArray = yaml.load(spaceName) as string[];
    //     for (const space of spaceNameArray) {
    //         console.log('space', space);
    //         const XPluginsConfig = h.domain[`${space}_plugin`];
    //         console.log('XPluginsConfig', XPluginsConfig);
    //         const XPlugins = yaml.load(XPluginsConfig) as string[];
    //         console.log('XPlugins', XPlugins);
    //         for (const plugin of XPlugins) {
    //             const D = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_plugins');
    //             const T = D.filter(s => s.key.includes('plugin_context_config'));
    //             const yamlString = yaml.dump(T);
    //             const pluginConfig = yaml.load(yamlString) as any;
    //             for (const config of pluginConfig) {
    //                 const value = config.value; // 获取 value 字段
    //                 const parsedValue = yaml.load(value); // 解析 YAML 字符串
                
    //                 if (Array.isArray(parsedValue)) {
    //                     for (const item of parsedValue) {
    //                         console.log(`${plugin} route:`, item.route); 
    //                         console.log(`${plugin} entry:`, item.entry);

    //                     }
    //                 }
    //             }
    //         }

    //     }
        

    // }
    // );


   
}

