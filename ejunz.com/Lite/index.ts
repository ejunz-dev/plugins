import { Context } from 'ejun';
import { SettingModel } from 'ejun';

const LiteDomains = ['A001', 'A002'];

const DEFAULT_NODES = {
    一: [
        { pic: 'aa', name: 'AA' },
        { pic: 'bb', name: 'BB' },
    ],
    二: [
        { pic: 'cc', name: 'CC' },
        { pic: 'dd', name: 'DD' },
    ],
    三: [
        { name: 'EE' },
        { name: 'FF' },
    ],
};


export const CATEGORIES = {
    A: ['Aa', 'Ab', 'Ac', 'Ad', 'Ae'],
    B: ['Ba', 'Bb', 'Bc', 'Bd', 'Be'],
    C: ['Ca', 'Cb', 'Cc', 'Cd', 'Ce'],
    D: ['Da', 'Db', 'Dc', 'Dd', 'De'],
    E: ['Ea', 'Eb', 'Ec', 'Ed', 'Ee'],
    F: ['Fa', 'Fb', 'Fc', 'Fd', 'Fe'],
    G: ['Ga', 'Gb', 'Gc', 'Gd', 'Ge'],
    H: ['Ha', 'Hb', 'Hc', 'Hd', 'He'],
    I: ['Ia', 'Ib', 'Ic', 'Id', 'Ie'],
    J: ['Ja', 'Jb', 'Jc', 'Jd', 'Je'],
  };
  export async function apply(ctx: Context) {
    ctx.once('handler/after', async (that) => {
        if (LiteDomains.includes(that.domain._id)) 
            console.log('domain', that.domain._id);
            console.log('Lite.Nodes');
            SettingModel.DomainSetting(
                SettingModel.Setting('setting_domain', 'nodes', DEFAULT_NODES, 'yaml', 'discussion.nodes', 'Discussion Nodes'),
            );
    }
);
ctx.once('handler/after', async (that) => {
    if (LiteDomains.includes(that.domain._id)) 
        console.log('domain', that.domain._id);
        console.log('Lite.Categories');
        SettingModel.DomainSetting(
            SettingModel.Setting('setting_domain', 'categories', CATEGORIES, 'yaml', 'problem.categories', 'Problem Categories'),
        );
}
);

}
