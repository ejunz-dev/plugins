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
import { getAddons } from 'ejun';
import { loadedPlugins } from 'ejun';
import path from 'path';

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
        let spacename = yaml.load(this.domain.spaces) as string[];
        const spacenameColumnsections: { [key: string]: string[] } = {};
        const defaultColumnsections: string[] = [];

        if (!spacename) {
            console.warn('spaces is undefined, using default empty array.');
            spacename = [];
        }
        for (const s of spacename) {
            console.log('loadedPlugins', loadedPlugins);
            const matchingPlugins = loadedPlugins.filter(plugin => {
                const pluginName = path.basename(plugin.name).toLowerCase();
                return pluginName === s.toLowerCase();
              });
              console.log('matchingPlugins', matchingPlugins);
              if (matchingPlugins.length > 0) {
                for (const plugin of matchingPlugins) {
                    const pluginPath = path.join(plugin.name, 'templates');
                    console.log('pluginPath', pluginPath);
                    
                    const spacefiles = fs.readdirSync(pluginPath).filter(file => 
                        !file.includes('space') && !file.endsWith('_main.html')
                    ).map(file => file.replace(/\.html$/, ''));
                    
                    spacenameColumnsections[s] = spacefiles;
                }
              }
              console.log('spacenameColumnsections', spacenameColumnsections);
            
            // const spacePluginPath = `/root/Dev/ejunz/plugins/${s}/templates`;
            // const spaceAddonPath = `/root/Dev/ejunz/packages/${s}/templates`;

            // const spacePath = fs.existsSync(spacePluginPath) ? spacePluginPath : spaceAddonPath;

            // const spacefiles = fs.readdirSync(pluginPath).filter(file => 
            //     !file.includes('space') && !file.endsWith('_main.html')
            // ).map(file => file.replace(/\.html$/, ''));
            
            // spacenameColumnsections[s] = spacefiles;
            
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
        console.log('this.response.body.completespacesettings', this.response.body.completespacesettings);

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

    const domainSettingpath = ['/domain/spaces/config', '/domain/spaces/store', '/domain/spaces/plugin', '/domain/spaces/permissions'];
    ctx.on('handler/finish', async (h) => {
        console.log('h.request.path', h.request.path);
        if (domainSettingpath.includes(h.request.path)) {
            h.UiContext.spacename = 'domain_dashboard';
        } else if (h.request.path.startsWith('/manage/')) {
            h.UiContext.spacename = 'manage_dashboard';
        } else if (h.request.path === '/discuss' || h.request.path === ('/discuss/') || /^\/discuss\/[a-fA-F0-9]{24}$/.test(h.request.path)) {
            h.UiContext.spacename = 'discussion';
        }
        console.log('h.UiContext.spacename', h.UiContext.spacename);
    });

    ctx.on('handler/after', async (h) => {
        if (!h.response.body.overrideNav) {
            h.response.body.overrideNav = [];
        }
    });

    // watch domain.spaces.plugins
    ctx.on('handler/after', async (h) => {
        // TODO 添加system限制检查
        const availableSpaces = h.domain.spaces;
        let availableSpacesArray: string[] = [];
        try {
            const parsedSpaces = yaml.load(availableSpaces);
            if (Array.isArray(parsedSpaces)) {
                availableSpacesArray = parsedSpaces;
            } else {
                console.warn('Parsed availableSpaces is not an array, using empty array.');
            }
        } catch (error) {
            console.error('Error parsing availableSpaces:', error);
        }
        if (availableSpacesArray.length === 0) {
            availableSpacesArray.push('homepage');
        }
        for (const space of availableSpacesArray) {
            const spaceConfig = h.domain[`${space}_plugin`];
            if (!spaceConfig) {
                console.warn(`spaceConfig for ${space} is undefined`);
                continue;
            }
            let spacePluginConfig;
            try {
                spacePluginConfig = yaml.load(spaceConfig) as any;
                console.log('spacePluginConfig', spacePluginConfig);
            } catch (error) {
                console.error(`Failed to parse spaceConfig for ${space}:`, error);
                continue;
            }
            if (!spacePluginConfig || !spacePluginConfig[space]) {
                console.warn(`spacePluginConfig or ${space} for ${space} is invalid`);
                continue;
            }
            const pluginRoutes = spacePluginConfig[space].map((item: any) => item.route);
            let spaceDefaultRoute = `/${space}`;
            if (space === 'homepage') {
                spaceDefaultRoute = '/';
            }
            pluginRoutes.push(spaceDefaultRoute);
            const overrideNav = spacePluginConfig[space].map((item: any) => ({
                name: item.name,
                args: item.args || {},
                displayName: item.displayName || '',
                checker: () => true
            }));
            const decodedPath = decodeURIComponent(h.request.path);
            if (pluginRoutes.some(route => decodedPath.includes(route))) {
                const matchedSpace = Object.keys(spacePluginConfig).find(spaceKey => {
                    return spacePluginConfig[spaceKey].some((item: any) => decodedPath.includes(item.route));
                });
                h.UiContext.spacename = matchedSpace || space;
                h.response.body.overrideNav = [
                    ...(h.response.body.overrideNav || []),
                    ...overrideNav
                ];
            }
        }
    });


    // // Inject NavMainDropdown
    // ctx.on('handler/before/DomainSpaceStore', (h) => {
    //     const availableSpaces = new Set(yaml.load(h.domain.spaces) as string[]);
    //     console.log('Before availableSpaces', Array.from(availableSpaces));
    //     console.log('h', h);

    //     // for (const space of availableSpaces) {
    //     //     const customchecker = () => availableSpaces.has(space);
    //     //     if (space === 'homepage') {
    //     //         ctx.injectUI('NavMainDropdown', 'homepage', customchecker);
    //     //         console.log('inject homepage');
    //     //     } else {
    //     //         ctx.injectUI('NavMainDropdown', `${space}_main`, customchecker);
    //     //         console.log('inject', `${space}_main`);
    //     //     }
    //     // }
    // });

    // ctx.on('handler/after/DomainSpaceStore#post', (h) => {
    //     const availableSpaces = new Set(yaml.load(h.domain.spaces) as string[]);
    //     console.log('After availableSpaces', Array.from(availableSpaces));

    //     // 初始化或获取已注入的空间状态
    //     h.injectedSpaces = h.injectedSpaces || new Set<string>();
    //     console.log('injectedSpaces before', Array.from(h.injectedSpaces));

    //     for (const space of availableSpaces) {
    //         const customchecker = () => {
    //             // 检查当前空间是否在 availableSpaces 中
    //             const isInAvailableSpaces = availableSpaces.has(space);
    //             // 检查当前空间是否已经注入
    //             const isAlreadyInjected = h.injectedSpaces.has(space);

    //             // 如果空间在 availableSpaces 中且未注入，则注入
    //             if (isInAvailableSpaces && !isAlreadyInjected) {
    //                 console.log('inject', space);
    //                 h.injectedSpaces.add(space);
    //                 return true;
    //             }

    //             // 如果空间不在 availableSpaces 中且已注入，则移除
    //             if (!isInAvailableSpaces && isAlreadyInjected) {
    //                 console.log('remove', space);
    //                 h.injectedSpaces.delete(space);
    //                 return false;
    //             }

    //             // 否则，保持当前状态
    //             console.log('keep', space);
    //             return isInAvailableSpaces;
    //         };

    //         if (space === 'homepage') {
    //             ctx.injectUI('NavMainDropdown', 'homepage', customchecker);
    //             console.log('inject homepage');
    //         } else {
    //             ctx.injectUI('NavMainDropdown', `${space}_main`, customchecker);
    //             console.log('inject', `${space}_main`);
    //         }
    //     }
    //     console.log('injectedSpaces after', Array.from(h.injectedSpaces));
    // });

    // const customchecker = (h) => {
    //     const availableSpaces = new Set(yaml.load(h.domain.spaces) as string[]);
    //     return availableSpaces.has(h.space);
    // }
    // const removeFunctions = new Map<string, () => void>();


    // ctx.on('handler/after', (h) => {
    //     const customchecker = (h) => {
    //         const availableSpaces = new Set(yaml.load(h.domain.spaces) as string[]);
    //         return availableSpaces.has(h.space);
    //     }


  
    //     });

    // //     ctx.on('handler/before/DomainSpaceStore#post', async (h) => {
    //         // 解析并存储初始状态
    //         const availableSpaces = h.domain.spaces;
    //         const parsedAvailableSpaces = yaml.load(availableSpaces) as string[];
    //         console.log('Before availableSpaces', parsedAvailableSpaces);
        
    //         // 存储初始状态
    //         h.initialSpaces = parsedAvailableSpaces;
    //     });
        
    //     ctx.on('handler/after/DomainSpaceStore#post', async (h) => {
    // // 获取并解析新的状态
    // const domain = await DomainModel.get(h.domain._id);
    // const availableSpaces = domain?.spaces;
    // const parsedAvailableSpaces = yaml.load(availableSpaces) as string[];
    // console.log('After availableSpaces', parsedAvailableSpaces);

    // // 比较初始状态和新的状态
    // const addedSpaces = _.difference(parsedAvailableSpaces, h.initialSpaces);
    // const removedSpaces = _.difference(h.initialSpaces, parsedAvailableSpaces);

    // // 处理新增的空间
    // if (addedSpaces.length > 0) {
    //     console.log('Added spaces:', addedSpaces);
    //     for (const space of addedSpaces) {
    //         const remove = ctx.injectUI('NavMainDropdown', `${space}_main`, () => parsedAvailableSpaces.includes(space));
    //         removeFunctions.set(space, remove);
    //     }
    // }

    // // 处理移除的空间
    // if (removedSpaces.length > 0) {
    //     console.log('Removed spaces:', removedSpaces);
    //     for (const space of removedSpaces) {
    //         console.log('remove', space);
    //         // 调用注销函数
    //         const remove = removeFunctions.get(space);
    //         if (remove) {
    //             remove();
    //             removeFunctions.delete(space);
    //         }
    //     }
    // }
    //     });



}


