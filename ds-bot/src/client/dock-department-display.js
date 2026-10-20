import COMPANY_PORTRAITS from '../shared/company-dock-portraits.json' with { type: 'json' }

// Presentation only. Actual membership and all action IDs come from the roster.
const SKINS = [
  { key: 'management', name: '总裁办', portrait: 0, aliases: /^(总裁办|总裁办公室|总助|管理部|management|executive office)$/i, roles: [] },
  { key: 'admin', name: '人事部', portrait: 3, aliases: /^(人事部|人力资源部|行政部|人事行政部|hr|human resources|admin)$/i, roles: [] },
  { key: 'product', name: '产品部', portrait: 2, aliases: /^(产品部|设计部|产品设计部|product|design)$/i, roles: [/项目|project manager/i, /数据|data|analyst/i, /用户研究|调研|user research/i] },
  { key: 'sales', name: '销售部', portrait: 6, aliases: /^(销售部|渠道部|销售渠道部|商务部|sales|channel|business development)$/i, roles: [/销售专员|销售代表|sales rep/i, /客户|account|customer/i, /渠道合作|伙伴开发|channel partner/i, /渠道运营|订单|履约/i, /合同|法务|contract|legal/i] },
  { key: 'tech', name: '技术部', portrait: 1, aliases: /^(技术部|技术研发部|研发部|工程部|tech|engineering|development)$/i, roles: [/研发|开发|developer|research/i, /测试|质量|test|qa/i, /安全|security/i] },
  { key: 'ops', name: '运营部', portrait: 4, aliases: /^(运营部|数据运营部|内容运营部|ops|operations)$/i, roles: [/内容|文案|品牌|content|brand|copy/i, /客服|support|customer service/i, /培训|training|education/i] },
  { key: 'temporary', name: '临时员工部', aliases: /^(临时员工部|临时协作|临时合作|temporary|temporary collaboration)$/i },
]

const skinFor = department => SKINS.find(skin => skin.aliases.test(String(department?.name ?? '').trim()))
const withPortrait = (bot, image, assetId) => ({ ...bot, avatar: { ...bot.avatar, image }, dockPortraitAssetId: assetId })
const temporaryPortrait = COMPANY_PORTRAITS.management.members[0]
const temporaryDisplay = bot => withPortrait(bot, temporaryPortrait.image, temporaryPortrait.assetId)

export function departmentDisplay(department) {
  const skin = skinFor(department)
  return skin ? { ...department, name: skin.name, title: skin.name, dockSkinKey: skin.key } : department
}

// Employees retain the same identity as the sidebar; only the collection gets a mascot.
export const temporaryDockRepresentative = temporaryDisplay
export const independentDockDisplay = bot => bot

export function orderDockGroups(groups) {
  const rank = group => group.leadEntity?.generalAssistant ? 0 : SKINS.findIndex(skin => skin.key === group.dept?.dockSkinKey)
  return groups.map((group, index) => ({ group, index, rank: rank(group) }))
    .sort((left, right) => (left.rank < 0 ? SKINS.length : left.rank) - (right.rank < 0 ? SKINS.length : right.rank) || left.index - right.index)
    .map(entry => entry.group)
}
