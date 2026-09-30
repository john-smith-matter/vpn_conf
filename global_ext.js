/**
 * Clash Verge Rev 订阅扩展脚本
 *
 * 功能：
 * 1. 开启 TUN 时禁用出口网口自动检测，并指定全局出口网口。
 * 2. 插入绑定“以太网 2”的 corp-direct 节点。
 * 3. 插入绑定 Tailscale 网口的 tailscale-direct 节点。
 * 4. 将 Tailscale 和企业域名 DNS 策略插入 nameserver-policy 最前面。
 * 5. 将企业域名和 Tailscale 虚拟 IP 路由规则插入 rules 最前面，
 *    强制通过各自的专用直连代理出口。
 */

// TUN 模式下的全局出口网口，按实际网口名称修改。
const GLOBAL_INTERFACE = "WLAN";

const CORP_PROXY_NAME = "corp-direct";
const CORP_INTERFACE = "以太网 2";
const CORP_DNS = "udp://10.206.2.5#corp-direct";

const CORP_DOMAINS = [
  "+.nubia.cn",
  "+.nubia.com",
  "+.zte.com.cn",
  "+.redmagic.com",
];

const TAILSCALE_PROXY_NAME = "tailscale-direct";
// 按实际的 Tailscale 网口名称修改。
const TAILSCALE_INTERFACE = "Tailscale";
const TAILSCALE_DNS_DOMAIN = "+.ts.net";
const TAILSCALE_DNS = "100.100.100.100";
const TAILSCALE_IPV4_CIDRS = ["100.64.0.0/10"];
const TAILSCALE_IPV6_CIDRS = ["fd7a:115c:a1e0::/48"];

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
   * 一、配置 TUN 的全局出口网口
   */

  if (
    config.tun &&
    typeof config.tun === "object" &&
    !Array.isArray(config.tun) &&
    config.tun.enable === true
  ) {
    config.tun["auto-detect-interface"] = false;
    config["interface-name"] = GLOBAL_INTERFACE;
  }

  /*
   * 二、插入专用直连代理
   */

  if (!Array.isArray(config.proxies)) {
    config.proxies = [];
  }

  // 删除订阅或 Merge 中可能已经存在的同名节点，避免重名。
  const otherProxies = config.proxies.filter(function (proxy) {
    return (
      !proxy ||
      (proxy.name !== CORP_PROXY_NAME && proxy.name !== TAILSCALE_PROXY_NAME)
    );
  });

  const corpDirect = {
    name: CORP_PROXY_NAME,
    type: "direct",
    udp: true,
    "interface-name": CORP_INTERFACE,
  };

  const tailscaleDirect = {
    name: TAILSCALE_PROXY_NAME,
    type: "direct",
    udp: true,
    "interface-name": TAILSCALE_INTERFACE,
  };

  // 放在代理列表最前面。
  config.proxies = [corpDirect, tailscaleDirect].concat(otherProxies);

  /*
   * 三、插入 Tailscale 和企业域名 DNS 策略
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

  // 必须位于 nameserver-policy 第一位；若旧策略中已有该项，
  // 同时以这里指定的 MagicDNS 地址覆盖它。
  newPolicy[TAILSCALE_DNS_DOMAIN] = TAILSCALE_DNS;

  // 企业域名优先使用企业 DNS，
  // DNS 请求自身通过 corp-direct / 以太网 2 发出。
  CORP_DOMAINS.forEach(function (domain) {
    newPolicy[domain] = CORP_DNS;
  });

  // 追加订阅中的其他 DNS 策略。
  Object.keys(oldPolicy).forEach(function (key) {
    if (key !== TAILSCALE_DNS_DOMAIN && CORP_DOMAINS.indexOf(key) === -1) {
      newPolicy[key] = oldPolicy[key];
    }
  });

  config.dns["nameserver-policy"] = newPolicy;

  /*
   * 四、插入企业域名和 Tailscale 路由规则
   */

  if (!Array.isArray(config.rules)) {
    config.rules = [];
  }

  const corpRuleDomains = CORP_DOMAINS.map(toRuleDomain);

  const corpRules = corpRuleDomains.map(function (domain) {
    return `DOMAIN-SUFFIX,${domain},${CORP_PROXY_NAME}`;
  });

  const tailscaleRules = TAILSCALE_IPV4_CIDRS.map(function (cidr) {
    return `IP-CIDR,${cidr},${TAILSCALE_PROXY_NAME},no-resolve`;
  }).concat(
    TAILSCALE_IPV6_CIDRS.map(function (cidr) {
      return `IP-CIDR6,${cidr},${TAILSCALE_PROXY_NAME},no-resolve`;
    }),
  );

  /*
   * 如果脚本被重复执行，去掉之前生成的同样规则。
   *
   * 只删除目标为 corp-direct 的同域名规则，
   * 以及目标为 tailscale-direct 的同网段规则，
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
    const value = parts[1].toLowerCase();
    const target = parts[2];

    const isCorpRule =
      type === "DOMAIN-SUFFIX" &&
      corpRuleDomains.indexOf(value) !== -1 &&
      target === CORP_PROXY_NAME;

    const isTailscaleRule =
      ((type === "IP-CIDR" && TAILSCALE_IPV4_CIDRS.indexOf(value) !== -1) ||
        (type === "IP-CIDR6" &&
          TAILSCALE_IPV6_CIDRS.indexOf(value) !== -1)) &&
      target === TAILSCALE_PROXY_NAME;

    return !(isCorpRule || isTailscaleRule);
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
   * 企业域名和 Tailscale 虚拟 IP 仍会首先命中对应的专用直连代理。
   */
  config.rules = tailscaleRules.concat(corpRules, otherRules);

  return config;
}
