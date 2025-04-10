import { load } from 'js-yaml';
import { Dictionary } from 'lodash';
import moment from 'moment-timezone';
import {
    CannotDeleteSystemDomainError, DomainJoinAlreadyMemberError, DomainJoinForbiddenError, ForbiddenError,AccessDeniedError,
    InvalidJoinInvitationCodeError, OnlyOwnerCanDeleteDomainError, PermissionError, RoleAlreadyExistError, ValidationError,
} from 'ejun';
import type { DomainDoc } from 'ejun';
import { PERM, PERMS_BY_FAMILY, PRIV,SettingModel } from 'ejun';
import * as discussion from 'ejun';
import {
    Handler, param, post, query, requireSudo, Types,domain,Context,DomainModel,OplogModel,SystemModel,
    UserModel,ContestModel,TrainingModel,DiscussionModel,ProblemModel,camelCase, md5 
} from 'ejun';
import { log2 } from 'ejun'
import yaml from 'js-yaml';
import _ from 'lodash';


export class A001CsnewHandler extends Handler {
    async get({ domainId }) {
        const allowedDomainIds = ['A001'];
        if (!allowedDomainIds.includes(domainId)) {
            throw new AccessDeniedError('Access denied for this domain');
        }

        this.response.template = 'csnews_domain.html';
        this.response.body = {
            domain: this.domain,
        };
        console.log('this.response.body', this.response.body);
    }
}

export async function apply(ctx: Context) {

    const CheckSpaceStore = (that) => {
        const domainId = that.domain._id;
        console.log(domainId);
        if (domainId !== 'A001') {
            throw new AccessDeniedError('Access denied for this domain');
        }
        return true;
    }


    ctx.Route('csnews_domain', '/csnews', A001CsnewHandler, CheckSpaceStore);
}
