import { load } from 'js-yaml';
import { Dictionary } from 'lodash';
import moment from 'moment-timezone';
import {
    CannotDeleteSystemDomainError, DomainJoinAlreadyMemberError, DomainJoinForbiddenError, ForbiddenError,
    InvalidJoinInvitationCodeError, OnlyOwnerCanDeleteDomainError, PermissionError, RoleAlreadyExistError, ValidationError,
} from 'ejun';
import type { DomainDoc } from 'ejun';
import { PERM, PERMS_BY_FAMILY, PRIV, PLUGINS_PERMS_BY_FAMILY } from 'ejun';
import * as discussion from 'ejun';
import * as system from 'ejun';
import {
    Handler, param, post, query, requireSudo, Types,domain,Context,DomainModel,OplogModel
} from 'ejun';
import { log2 } from 'ejun'
import { loadedPlugins } from 'ejun';

class ManageHandler extends Handler {
    async prepare({ domainId }) {
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
        this.domain = await DomainModel.get(domainId);
    }
}
class SystemPluginHandler extends ManageHandler {
    @requireSudo
    async get({ domainId }) {
        this.response.template = 'manage_plugins.html';
        this.response.body = {
            domain: this.domain,
            plugins: loadedPlugins,
        };
        console.log('this.response.body', this.response.body);
    }

    // @requireSudo
    // async post({ domainId }) {
    //     const roles = {};
    //     for (const role in this.request.body) {
    //         const perms = this.request.body[role] instanceof Array
    //             ? this.request.body[role]
    //             : [this.request.body[role]];
    //         roles[role] = 0n;
    //         for (const r of perms) roles[role] |= 1n << BigInt(r);
    //     }
    //     await Promise.all([
    //         DomainModel.setRoles(domainId, roles),
    //     ]);
    //     this.back();
    // }
}

class DomainPluginHandler extends ManageHandler {
    @requireSudo
    async get({ domainId }) {
        const roles = await DomainModel.getRoles(domainId);
        this.response.template = 'domain_plugins.html';
        this.response.body = {
            roles, PLUGINS_PERMS_BY_FAMILY, domain: this.domain, log2,
        };
        console.log('this.response.body', this.response.body);
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


export async function apply(ctx: Context) {
    global.Ejunz.ui.inject('DomainManage', 'domain_plugins', { family: 'Access Control', icon: 'user' });
    global.Ejunz.ui.inject('NavDropdown', 'manage_plugins', { prefix: 'manage' }, PRIV.PRIV_EDIT_SYSTEM);

    ctx.Route('domain_plugins', '/domain/plugins', DomainPluginHandler);
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
}

