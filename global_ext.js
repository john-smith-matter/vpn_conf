/**
 * Clash Verge Rev 订阅扩展脚本
 *
 * 从 x-specific-targets 读取需要使用指定网口的目标，例如：
 *
 * x-specific-targets:
 *   tailscale-direct:
 *     domains: ["+.ts.net"]
 *     ip-cidrs: ["100.64.0.0/10", "fd7a:115c:a1e0::/48"]
 *     dns: 100.100.100.100
 *     interface-name: Tailscale
 *
 * 每个目标会生成一个同名 direct 代理，并为其域名和 IP 网段生成
 * 优先路由规则。配置了 dns 时，还会自动附加目标代理名，
 * 并为该目标的域名生成 DNS 策略。
 */

const SPECIFIC_TARGETS_FIELD = "x-specific-targets";

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function stringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(function (item) {
      return typeof item === "string" && item.trim() !== "";
    })
    .map(function (item) {
      return item.trim();
    });
}

function addProxyToDnsServer(server, targetName) {
  const normalizedServer = server.trim();

  if (normalizedServer === "") {
    return null;
  }

  const separator = normalizedServer.indexOf("#") === -1 ? "#" : "&";
  return `${normalizedServer}${separator}${targetName}`;
}

function addProxyToDns(dns, targetName) {
  if (typeof dns === "string") {
    return addProxyToDnsServer(dns, targetName);
  }

  if (Array.isArray(dns)) {
    return dns
      .filter(function (server) {
        return typeof server === "string";
      })
      .map(function (server) {
        return addProxyToDnsServer(server, targetName);
      })
      .filter(function (server) {
        return server !== null;
      });
  }

  return null;
}

function readSpecificTargets(config) {
  const rawTargets = config[SPECIFIC_TARGETS_FIELD];

  if (!isObject(rawTargets)) {
    return [];
  }

  return Object.keys(rawTargets)
    .map(function (name) {
      const rawTarget = rawTargets[name];

      if (!isObject(rawTarget) || name.trim() === "") {
        return null;
      }

      const interfaceName = rawTarget["interface-name"];

      if (typeof interfaceName !== "string" || interfaceName.trim() === "") {
        return null;
      }

      const targetName = name.trim();

      return {
        name: targetName,
        domains: stringList(rawTarget.domains),
        ipCidrs: stringList(rawTarget["ip-cidrs"]),
        dns: addProxyToDns(rawTarget.dns, targetName),
        interfaceName: interfaceName.trim(),
      };
    })
    .filter(function (target) {
      return target !== null;
    });
}

/**
 * nameserver-policy 使用 "+.example.com"，
 * rules 使用 "DOMAIN-SUFFIX,example.com,..."。
 */
function toRuleDomain(domain) {
  return domain.replace(/^\+\./, "").replace(/^\./, "");
}

function makeRules(target) {
  const domainRules = target.domains.map(function (domain) {
    return `DOMAIN-SUFFIX,${toRuleDomain(domain)},${target.name}`;
  });

  const ipRules = target.ipCidrs.map(function (cidr) {
    const type = cidr.indexOf(":") === -1 ? "IP-CIDR" : "IP-CIDR6";
    return `${type},${cidr},${target.name},no-resolve`;
  });

  return domainRules.concat(ipRules);
}

function main(config) {
  if (!isObject(config)) {
    return config;
  }

  const targets = readSpecificTargets(config);

  if (targets.length === 0) {
    return config;
  }

  /*
   * 一、为每个目标插入绑定指定网口的 direct 代理
   */

  if (!Array.isArray(config.proxies)) {
    config.proxies = [];
  }

  const targetNames = targets.map(function (target) {
    return target.name;
  });

  // 删除订阅或 Merge 中可能已经存在的同名节点，避免重名。
  const otherProxies = config.proxies.filter(function (proxy) {
    return !proxy || targetNames.indexOf(proxy.name) === -1;
  });

  const targetProxies = targets.map(function (target) {
    return {
      name: target.name,
      type: "direct",
      udp: true,
      "interface-name": target.interfaceName,
    };
  });

  config.proxies = targetProxies.concat(otherProxies);

  /*
   * 二、为配置了 DNS 的目标插入域名解析策略
   */

  const dnsTargets = targets.filter(function (target) {
    return (
      target.domains.length > 0 &&
      target.dns !== null &&
      (!Array.isArray(target.dns) || target.dns.length > 0)
    );
  });

  if (dnsTargets.length > 0) {
    if (!isObject(config.dns)) {
      config.dns = {};
    }

    const oldPolicy = isObject(config.dns["nameserver-policy"])
      ? config.dns["nameserver-policy"]
      : {};
    const newPolicy = {};
    const targetDomains = [];

    dnsTargets.forEach(function (target) {
      target.domains.forEach(function (domain) {
        newPolicy[domain] = target.dns;
        targetDomains.push(domain);
      });
    });

    // 目标 DNS 策略放在最前，然后保留订阅中的其他策略。
    Object.keys(oldPolicy).forEach(function (domain) {
      if (targetDomains.indexOf(domain) === -1) {
        newPolicy[domain] = oldPolicy[domain];
      }
    });

    config.dns["nameserver-policy"] = newPolicy;
  }

  /*
   * 三、为域名和 IP 网段插入优先路由规则
   */

  if (!Array.isArray(config.rules)) {
    config.rules = [];
  }

  const targetRules = [];

  targets.forEach(function (target) {
    Array.prototype.push.apply(targetRules, makeRules(target));
  });

  // 脚本重复执行时，删除上一次生成的同样规则。
  const targetRuleSet = {};
  targetRules.forEach(function (rule) {
    targetRuleSet[rule] = true;
  });

  const otherRules = config.rules.filter(function (rule) {
    return typeof rule !== "string" || !targetRuleSet[rule];
  });

  // Mihomo rules 按顺序匹配，因此目标规则必须位于订阅规则之前。
  config.rules = targetRules.concat(otherRules);

  return config;
}
