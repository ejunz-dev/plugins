import { load } from 'js-yaml';
import { Dictionary } from 'lodash';
import moment from 'moment-timezone';
import {
    CannotDeleteSystemDomainError, DomainJoinAlreadyMemberError, DomainJoinForbiddenError, ForbiddenError,
    InvalidJoinInvitationCodeError, OnlyOwnerCanDeleteDomainError, PermissionError, RoleAlreadyExistError, ValidationError,
    AccessDeniedError,
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

// class ManageHandler extends Handler {
//     async prepare({ domainId }) {
//         this.checkPerm(PERM.PERM_EDIT_DOMAIN);
//         this.domain = await DomainModel.get(domainId);
//     }
// }
class TestHandler extends Handler {
    async get({ domainId }) {
        const allowedDomainIds = ['A001'];
        if (!allowedDomainIds.includes(domainId)) {
            throw new AccessDeniedError('Access denied for this domain');
        }

        this.response.template = 'test.html';
        this.response.body = {
            domain: this.domain,
            plugins: loadedPlugins,
        };
        console.log('this.response.body', this.response.body);
    }
}

export async function apply(ctx: Context) {
    ctx.Route('test', '/test', TestHandler);

}