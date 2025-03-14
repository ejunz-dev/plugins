import { load } from 'js-yaml';
import { Dictionary } from 'lodash';
import moment from 'moment-timezone';
import {
    CannotDeleteSystemDomainError, DomainJoinAlreadyMemberError, DomainJoinForbiddenError, ForbiddenError,
    InvalidJoinInvitationCodeError, OnlyOwnerCanDeleteDomainError, PermissionError, RoleAlreadyExistError, ValidationError,
} from 'ejun';
import type { DomainDoc } from 'ejun';
import { PERM, PERMS_BY_FAMILY, PRIV } from 'ejun';
import * as discussion from 'ejun';
import * as oplog from 'ejun';
import * as system from 'ejun';
import {
    Handler, param, post, query, requireSudo, Types,domain,Context,DomainModel
} from 'ejun';
import { log2 } from 'ejun'


class ManageHandler extends Handler {
    async prepare({ domainId }) {
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
        this.domain = await DomainModel.get(domainId);
    }
}
class DomainPluginHandler extends ManageHandler {
    @requireSudo
    async get({ domainId }) {

        this.response.template = 'domain_plugins.html';
        this.response.body = {
            domain: this.domain,
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

export async function apply(ctx: Context) {
    global.Ejunz.ui.inject('DomainManage', 'domain_plugins', { family: 'Access Control', icon: 'user' });
    console.log('Ejunz.ui.INJECT', global.Ejunz.ui.inject);

    ctx.Route('domain_plugins', '/domain/plugins', DomainPluginHandler);
    
    ctx.i18n.load('zh', {
        domain_plugins: '域插件',
    });
  
}

