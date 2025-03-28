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
   // @requireSudo
    async get({ domainId }) {
        const roles = await DomainModel.getRoles(domainId);
        this.response.template = 'domain_plugins_permissions.html';
        this.response.body = {
            roles,
            PERMS_BY_FAMILY,
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

class DomainPluginConfigHandler extends ManageHandler {
    async get({ domainId }) {
        let allowedPlugins = this.domain.plugins;
        if (!allowedPlugins) {
            console.warn('allowedPlugins is undefined, using default empty array.');
            allowedPlugins = '[]';
        }

        let allowedPluginsArray: string[] = [];

        try {
            const parsed = yaml.load(allowedPlugins);
            if (Array.isArray(parsed)) {
                allowedPluginsArray = parsed;
            } else {
                throw new Error('Parsed allowedPlugins is not an array');
            }
        } catch (error) {
            console.error('Error parsing allowedPlugins:', error);
            allowedPluginsArray = []; 
        }
            const pluginSetting = SettingModel.DOMAIN_PLUGIN_SETTINGS;
            const settingsMap = new Map(pluginSetting.map(s => [s.key, s]));
            const completePluginSettings = allowedPluginsArray.map(pluginName => {
                if (settingsMap.has(pluginName)) {
                    return settingsMap.get(pluginName);
                } else {
                    console.warn(`No settings found for plugin: ${pluginName}`);
                    return null;
                }
            });
        this.response.template = 'domain_plugins_config.html';
        this.response.body.current = this.domain;
        this.response.body.settings = completePluginSettings;
    }
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
    async get({ domainId }) {
        const T = SettingModel.SYSTEM_SETTINGS.filter(s => s.key.endsWith('.allowed_domains'));
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
        console.log(this.response.body.current);
        console.log(this.response.body.settings);


    }
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
    ctx.on('handler/after/SystemPlugin#post', (h) => {
        const systemPlugins = SettingModel.SYSTEM_SETTINGS.filter(s => s.family === 'system_plugins');
        for (const s of systemPlugins) {
            const afterSystemPlugin = SystemModel.get(s.key);
            const parsedAfterSystemPlugin = yaml.load(afterSystemPlugin);
            const initialState = h.initialState && h.initialState[s.key];

            if (initialState) {
                const removed = _.differenceWith(initialState as any[], parsedAfterSystemPlugin as any[], _.isEqual);

                if (removed.length > 0) {
                    console.log(` ${s.key} has remove domain:`, {
                        removed: removed
                    });
                    const Pluginname = s.name;
                    const PluginFamily = s.family;
                    const pluginsPerm = PERMS_BY_FAMILY['plugins'];
                    const PermToremove = pluginsPerm.filter(permission => permission.name === Pluginname);
                    console.log(`Related permissions for ${Pluginname}:`, PermToremove);
                    console.log('h.domain.roles',h.domain.roles);
                    //TODO delete the related permissions
                    //TODO callback dispose 
                    
                }
            }
        }
    });

    ctx.on('handler/after/DomainPluginStore#post', (h) => {
        console.log('DomainPluginStore#post',h);
    });

}

