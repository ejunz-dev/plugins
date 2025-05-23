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
import { loadedPlugins } from 'ejun';
import yaml from 'js-yaml';
import _ from 'lodash';
interface ResultItem {
    name: string;
    Systemallowed: any;
}

async function SystemChecker(domainId: string, pluginName: string) {
    const SystemSettings = SettingModel.SYSTEM_SETTINGS.filter(s => 
        s.family === 'system_plugins' && s.name === pluginName
    );
    const resultArray: ResultItem[] = [];

    for (const s of SystemSettings) {
        const name = s.name;
        const SystemCurrentpluginsArray = await SystemModel.get(s.key);
        const Current = yaml.load(SystemCurrentpluginsArray);
        
        const result: ResultItem = {
            name: name,
            Systemallowed: Current
        };
        resultArray.push(result);
    }

    const hasAccess = resultArray.some(item => item.Systemallowed.includes(domainId));
    console.log(`Access for ${pluginName} in ${domainId} by SYSTEM`, hasAccess);
    return hasAccess;
}
async function DomainChecker(DomainId: string, pluginName: string) {
    const DomainCurrentplugins = await DomainModel.get(DomainId);
    const plugins = DomainCurrentplugins?.plugins;

    const hasAccess = plugins ? plugins.includes(pluginName) : false;
    console.log(`Access for ${pluginName} in ${DomainId} by DOMAIN`, hasAccess);
    return hasAccess;
}

async function checkAccess(domainId: string, pluginName: string) {
    const hasSystemAccess = await SystemChecker(domainId, pluginName);
    const hasDomainAccess = await DomainChecker(domainId, pluginName);

    const hasAccess = hasSystemAccess && hasDomainAccess;
    console.log(`Ultimate Access for ${pluginName} in domain ${domainId}:`, hasAccess);
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
class SystemPluginHandler extends SystemHandler {
    @requireSudo
    async get() {
        this.response.template = 'manage_plugins.html';
        this.response.body.current = {};
        this.response.body.settings = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_plugins');
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

class DomainPluginPermissionsHandler extends ManageHandler {
    @requireSudo
     async get({ domainId }) {
         const roles = await DomainModel.getRoles(domainId);
         const D = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_plugins');
         const T = D.filter(s => s.key.includes('plugins_allowed_domains'));
       
         const Bannedplugins: string[] = [];
         const Allowedplugins: string[] = [];
         for (const s of T) {
             const systempluginsKey = await SystemModel.get(s.key);
             const systempluginsName = s.name;
             const systempluginsMap = {}; 
             systempluginsMap[systempluginsName] = systempluginsKey;
 
             if (!systempluginsMap[systempluginsName].includes(domainId)) {
                 const bannedplugins = systempluginsName;
                 Bannedplugins.push(bannedplugins);
             } else {
                 const allowedplugins = systempluginsName;
                 Allowedplugins.push(allowedplugins);
 
                 const hasAccess = await DomainChecker(domainId, allowedplugins);
                 console.log('hasAccess',hasAccess);
                 if (!hasAccess) {
                     Bannedplugins.push(allowedplugins);
                 }
             }
         }
 
         let NEW_PERMS_BY_FAMILY = { ...PERMS_BY_FAMILY };
 
         if (Bannedplugins.length > 0) {
             for (const bannedplugin of Bannedplugins) {
                 for (const Type in NEW_PERMS_BY_FAMILY) {
                     NEW_PERMS_BY_FAMILY[Type] = NEW_PERMS_BY_FAMILY[Type].filter(permission => permission.name !== bannedplugin);
                 }
             }
         } else {
             NEW_PERMS_BY_FAMILY = PERMS_BY_FAMILY;
         }
         console.log('Bannedplugins',Bannedplugins);
         console.log('NEW_PERMS_BY_FAMILY',NEW_PERMS_BY_FAMILY);
 
         this.response.template = 'domain_plugins_permissions.html';
         this.response.body = {
             roles,
             NEW_PERMS_BY_FAMILY,
             domain: this.domain,
             log2,
         };
         console.log('this.response.body',this.response.body);
     }
 
     @requireSudo
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
 

class DomainPluginConfigHandler extends ManageHandler {
    @requireSudo
    async get({ domainId }) {
        let Plugins = this.domain.plugins;
        if (!Plugins) {
            console.warn('Plugins is undefined, using default empty array.');
            Plugins = '[]';
        }

        let PluginsArray: string[] = [];

        try {
            const parsed = yaml.load(Plugins);
            if (Array.isArray(parsed)) {
                PluginsArray = parsed;
            } else {
                throw new Error('Parsed allowedPlugins is not an array');
            }
        } catch (error) {
            console.error('Error parsing allowedPlugins:', error);
            PluginsArray = []; 
        }
            const pluginSetting = SettingModel.DOMAIN_PLUGIN_SETTINGS;
            const settingsMap = new Map(pluginSetting.map(s => [s.key, s]));
            let completePluginSettings = PluginsArray.map(pluginName => {
                if (settingsMap.has(pluginName)) {
                    return settingsMap.get(pluginName);
                } else {
                    console.warn(`No settings found for plugin: ${pluginName}`);
                    return null;
                }
            });
        const D = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_plugins');
        const T = D.filter(s => s.key.includes('plugins_allowed_domains'));
        const DomainBannedPlugins = {};
        const BannedPlugins:string[] = [];

        for (const s of T) {
            const systemPluginsKey = SystemModel.get(s.key);
            const systemPluginsName = s.name;
            const systemPluginsMap = {}; 
            systemPluginsMap[systemPluginsName] = systemPluginsKey;

            if (!systemPluginsMap[systemPluginsName].includes(domainId)) {
                const bannedPlugins = systemPluginsName;
                BannedPlugins.push(bannedPlugins);
            }
        }

        for (const bannedPlugin of BannedPlugins) {
            completePluginSettings = completePluginSettings.filter(plugin => plugin.key !== bannedPlugin);
        }

        this.response.template = 'domain_plugins_config.html';
        this.response.body.current = this.domain;
        this.response.body.settings = completePluginSettings;
    }
    @requireSudo
    async post(args) {
        console.log(args);
        if (args.operation) return;
        const $set = {};
        for (const key in args) {
            if (SettingModel.DOMAIN_PLUGIN_SETTINGS_BY_KEY[key]) $set[key] = args[key];
        }
        await DomainModel.edit(args.domainId, $set);
        this.response.redirect = this.url('domain_plugins_config');
    }
}

class DomainPluginStoreHandler extends ManageHandler {  
    @requireSudo
    async get({ domainId }) {
        const T = SettingModel.SYSTEM_SETTINGS.filter(s => s.key.endsWith('.plugins_allowed_domains'));
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

        const domainPluginsStore = allowedDomainsSetting.reduce((acc, setting) => {
            const allowedDomains = yaml.load(setting.value) as string[];
            if (allowedDomains.includes(domainId)) {
                acc.push(setting.name);
            }
            return acc;
        }, []);

        this.response.template = 'domain_plugins_store.html';
        this.response.body.current = this.domain;
        this.response.body.settings = SettingModel.DOMAIN_PLUGIN_SETTINGS.filter(s => s.family === 'setting_domain_on_plugins');
        // for (const s of this.response.body.settings) {
        //     this.response.body.current[s.key] = DomainModel.get(s.key);
        // }
        this.response.body.domainPluginsStore = domainPluginsStore;
        console.log('this.response.body.current',this.response.body.current);
        console.log('this.response.body.settings',this.response.body.settings);


    }
    @requireSudo
    async post(args) {
        console.log(args);
        if (args.operation) return;
        const $set = {};
        for (const key in args) {
            if (SettingModel.DOMAIN_PLUGIN_SETTINGS_BY_KEY[key]) $set[key] = args[key];
        }
        await DomainModel.edit(args.domainId, $set);
        this.response.redirect = this.url('domain_plugins_store');
    }
}


export async function apply(ctx: Context) {
    global.Ejunz.ui.inject('DomainManage', 'domain_plugins_store', { family: 'plugins', icon: 'book' });
    global.Ejunz.ui.inject('DomainManage', 'domain_plugins_permissions', { family: 'plugins', icon: 'book' });
    global.Ejunz.ui.inject('DomainManage', 'domain_plugins_config', { family: 'plugins', icon: 'book' });
    global.Ejunz.ui.inject('NavDropdown', 'manage_plugins', { prefix: 'manage' }, PRIV.PRIV_EDIT_SYSTEM);

    ctx.Route('manage_plugins', '/manage/plugins', SystemPluginHandler);
    ctx.Route('domain_plugins_permissions', '/domain/plugins/permissions', DomainPluginPermissionsHandler);
    ctx.Route('domain_plugins_config', '/domain/plugins/config', DomainPluginConfigHandler);
    ctx.Route('domain_plugins_store', '/domain/plugins/store', DomainPluginStoreHandler);

    ctx.i18n.load('zh', {
        'plugins': '本域插件',
        domain_plugins: '管理插件',
        manage_plugins: '系统插件',
        domain_plugins_permissions: '插件权限',
        domain_plugins_config: '插件配置',
        domain_plugins_store: '插件商店',
    });

    ctx.i18n.load('en', {
        'plugins': 'Domain Plugins',
        manage_plugins: 'Manage System Plugins',
        domain_plugins_store: 'Domain Plugin Store',
        domain_plugins_permissions: 'Domain Plugin Permissions',
        domain_plugins_config: 'Domain Plugin Config',
    });


    ctx.injectUI('Home_Domain', 'domain_plugins', (h) => ({
        icon: 'book',
        displayName: '插件',
        uid: h.domain._id.toString()
        
    }));

    ctx.injectUI('ControlPanel', 'manage_plugins', (h) => ({}));

    ctx.on('handler/before/SystemPlugin#post', (h) => {
        const systemPlugins = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_plugins');
        for (const s of systemPlugins) {
            const beforeSystemPlugin = SystemModel.get(s.key);
            const parsedBeforeSystemPlugin = yaml.load(beforeSystemPlugin);
            h.initialState = h.initialState || {};
            h.initialState[s.key] = parsedBeforeSystemPlugin || [];
        }
    });
    ctx.on('handler/after/SystemPlugin#post', async (h) => {
        const systemplugins = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_plugins');
        for (const s of systemplugins) {
            const afterSystemPlugin = SystemModel.get(s.key);
            const parsedAfterSystemPlugin = yaml.load(afterSystemPlugin);
            const initialState = h.initialState && h.initialState[s.key];

            if (initialState) {
                const updateDomains = _.differenceWith(initialState as any[], parsedAfterSystemPlugin as any[], _.isEqual);

                if (updateDomains.length > 0) {
                    console.log(` ${s.name} has update domains: ${updateDomains}`, {
                        updateDomains: updateDomains
                    });
                    const Pluginname = s.name;
                    const pluginsPerm = PERMS_BY_FAMILY['plugins'];
                    const PermToremove = pluginsPerm.filter(permission => permission.name === Pluginname);
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
                        console.info('updatedDomainRoles',updatedDomainRoles);
                        await DomainModel.setRoles(domain, updatedDomainRoles);
                    }
                }
            }
        }
    });

    ctx.on('handler/before/DomainPluginStore#post', async (h) => {
        const domainplugins = SettingModel.DOMAIN_PLUGIN_SETTINGS.filter(s => s.family === 'setting_domain_on_plugins');
        for (const s of domainplugins) {
            const before = await DomainModel.get(h.domain._id);
            const beforeplugins = before?.plugins;
            let parsedBeforeplugins : string[] = [];
        if (beforeplugins) {
            parsedBeforeplugins = yaml.load(beforeplugins) as string[];
        } else {
            parsedBeforeplugins = [];
        }
        h.initialState = h.initialState || {};
        h.initialState['plugins'] = parsedBeforeplugins;
        }
  
    });

    ctx.on('handler/after/DomainPluginStore#post', async (h) => {
        const domainplugins = SettingModel.DOMAIN_PLUGIN_SETTINGS.filter(s => s.family === 'setting_domain_on_plugins');
        for (const s of domainplugins) {
        const after = await DomainModel.get(h.domain._id);
        const afterplugins = after?.plugins;
        let parsedAfterplugins: string[] = [];

        if (afterplugins) {
            parsedAfterplugins = yaml.load(afterplugins) as string[];

        } else {
            parsedAfterplugins = [];
        }
        const initialState = h.initialState && h.initialState[s.key];


        if (initialState) {
            const removed = _.differenceWith(initialState as any[], parsedAfterplugins as any[], _.isEqual);

            if (removed.length > 0) {
                console.log(`Removed domains: ${removed.join(', ')}`, {
                    removed: removed
                });
                const Pluginname = removed;
                const pluginsPerm = PERMS_BY_FAMILY['plugins'];
                const PermToremove = pluginsPerm.filter(permission => permission.name.includes(Pluginname));
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

   

}

