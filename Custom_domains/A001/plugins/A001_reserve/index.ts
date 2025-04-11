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
    UserModel,ContestModel,TrainingModel,DiscussionModel,ProblemModel,camelCase, md5,superagent
} from 'ejun';
import { log2 } from 'ejun'
import yaml from 'js-yaml';
import _ from 'lodash';
import MarkdownIt from 'markdown-it';

export class A001ReserveHandler extends Handler {
    async get({ domainId }) {
        const allowedDomainIds = ['A001'];
        if (!allowedDomainIds.includes(domainId)) {
            throw new AccessDeniedError('Access denied for this domain');
        }
        this.response.template = 'csnews_domain.html';
        this.response.body = {
            domain: this.domain,
        };
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

    ctx.i18n.load('zh', {
        'CS_NEWS': 'CS新闻',
        'csnews_domain': 'CS新闻',
    });


    ctx.Route('csnews_domain', '/csnews', A001ReserveHandler, CheckSpaceStore);


    ctx.once('handler/after', async (that) => {
        if (that.domain._id === 'A001') 
            if (that.domain.csnews) {
            SettingModel.DomainSetting(
                SettingModel.Setting('setting_domain', 'csnews', '', 'markdown', 'CSNEWS'),
            );
        }
    });

    ctx.on('handler/after/A001ReserveApi#get', async (that) => {
        await DomainModel.edit('A001', { csnews: that.response.body.markdown });
    });
}
