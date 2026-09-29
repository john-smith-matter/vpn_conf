/**
 * Clash Verge Rev 订阅扩展脚本
 *
 * 功能：
 * 1. 插入绑定“以太网 2”的 corp-direct 节点。
 * 2. 将企业域名 DNS 策略插入 nameserver-policy 最前面。
 * 3. 将企业域名路由规则插入 rules 最前面，
 *    强制通过 corp-direct（即“以太网 2”）出口。
 */

const CORP_PROXY_NAME = "corp-direct";
const CORP_INTERFACE = "以太网 2";
const CORP_DNS = "udp://10.206.2.5#corp-direct";

const CORP_DOMAINS = [
  "+.nubia.cn",
  "+.nubia.com",
  "+.zte.com.cn",
  "+.redmagic.com",
];

/**
 * nameserver-policy 使用 "+.example.com"
 * rules 使用 "DOMAIN-SUFFIX,example.com,..."
 */
function toRuleDomain(domain) {
  return domain.replace(/^\+\./, "").replace(/^\./, "");
}

function main(config) {
  if (!config || typeof config !== "object") {
    return config;
  }

  /*
   * 一、插入 corp-direct 代理
   */

  if (!Array.isArray(config.proxies)) {
    config.proxies = [];
  }

  // 删除订阅或 Merge 中可能已经存在的同名节点，避免重名。
  const otherProxies = config.proxies.filter(function (proxy) {
    return !proxy || proxy.name !== CORP_PROXY_NAME;
  });

  const corpDirect = {
    name: CORP_PROXY_NAME,
    type: "direct",
    udp: true,
    "interface-name": CORP_INTERFACE,
  };

  // 放在代理列表最前面。
  config.proxies = [corpDirect].concat(otherProxies);

  /*
   * 二、插入企业域名 DNS 策略
   */

  if (
    !config.dns ||
    typeof config.dns !== "object" ||
    Array.isArray(config.dns)
  ) {
    config.dns = {};
  }

  const oldPolicy =
    config.dns["nameserver-policy"] &&
    typeof config.dns["nameserver-policy"] === "object" &&
    !Array.isArray(config.dns["nameserver-policy"])
      ? config.dns["nameserver-policy"]
      : {};

  const newPolicy = {};

  // 企业域名优先使用企业 DNS，
  // DNS 请求自身通过 corp-direct / 以太网 2 发出。
  CORP_DOMAINS.forEach(function (domain) {
    newPolicy[domain] = CORP_DNS;
  });

  // 追加订阅中的其他 DNS 策略。
  Object.keys(oldPolicy).forEach(function (key) {
    if (CORP_DOMAINS.indexOf(key) === -1) {
      newPolicy[key] = oldPolicy[key];
    }
  });

  config.dns["nameserver-policy"] = newPolicy;

  /*
   * 三、插入企业域名路由规则
   */

  if (!Array.isArray(config.rules)) {
    config.rules = [];
  }

  const corpRuleDomains = CORP_DOMAINS.map(toRuleDomain);

  const corpRules = corpRuleDomains.map(function (domain) {
    return `DOMAIN-SUFFIX,${domain},${CORP_PROXY_NAME}`;
  });

  /*
   * 如果脚本被重复执行，去掉之前生成的同样规则。
   *
   * 只删除目标为 corp-direct 的同域名规则，
   * 不修改订阅自身可能存在的其它规则。
   */
  const otherRules = config.rules.filter(function (rule) {
    if (typeof rule !== "string") {
      return true;
    }

    const parts = rule.split(",").map(function (part) {
      return part.trim();
    });

    if (parts.length < 3) {
      return true;
    }

    const type = parts[0].toUpperCase();
    const domain = parts[1].toLowerCase();
    const target = parts[2];

    return !(
      type === "DOMAIN-SUFFIX" &&
      corpRuleDomains.indexOf(domain) !== -1 &&
      target === CORP_PROXY_NAME
    );
  });

  /*
   * 必须放在订阅规则最前面。
   *
   * Mihomo rules 按顺序匹配，这样即使订阅中存在：
   *
   *   GEOSITE,CN,DIRECT
   *   GEOIP,CN,DIRECT
   *   MATCH,某代理
   *
   * 企业域名仍会首先命中 corp-direct。
   */
  config.rules = corpRules.concat(otherRules);

  return config;
}
