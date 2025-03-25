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
        console.log('this.response.body.settings', this.response.body.settings);
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

class DomainPluginStoreHandler extends ManageHandler {
   // @requireSudo
    async get({ domainId }) {
        const roles = await DomainModel.getRoles(domainId);
        this.response.template = 'domain_plugins.html';
        this.response.body = {
            roles,
            PERMS_BY_FAMILY: { plugins: PERMS_BY_FAMILY.plugins },
            domain: this.domain,
            log2,
        };
        console.log('this.response.body', this.response.body);
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


export async function apply(ctx: Context) {
    global.Ejunz.ui.inject('DomainManage', 'domain_plugins', { family: 'Access Control', icon: 'user' });
    global.Ejunz.ui.inject('NavDropdown', 'manage_plugins', { prefix: 'manage' }, PRIV.PRIV_EDIT_SYSTEM);

    ctx.Route('domain_plugins', '/domain/plugins', DomainPluginStoreHandler);
    ctx.Route('manage_plugins', '/manage/plugins', SystemPluginHandler);

    ctx.i18n.load('zh', {
        domain_plugins: '管理插件',
        manage_plugins: '系统插件',
    });

    ctx.injectUI('Home_Domain', 'domain_plugins', (h) => ({
        icon: 'book',
        displayName: '插件',
        uid: h.domain._id.toString()
        
    }));

    ctx.injectUI('ControlPanel', 'manage_plugins', (h) => ({}));

}

