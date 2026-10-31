# 代理客户端云端规则

四份配置通过 GitHub URL 导入，本地覆写补充节点、订阅和 `default` 代理组。云端不包含节点凭据或代理组；已有 `global_ext.js` 继续用于设备专用的 Mihomo 网口规则。

## 直接维护和更新

自定义规则只有四份，均为手工维护的 `classical` 文本；四个客户端引用完全相同的 URL：

| 文件 | 用途 |
| --- | --- |
| `private.list` | 内网域名、私有 IP、国内 DNS 上游 IP 直连 |
| `proxy.list` | 境外 DNS、GitHub、OpenAI/ChatGPT、Google/YouTube 等明确代理规则 |
| `china.list` | 国内应用、支付和 CDN 的直连补充 |
| `reject.list` | 小规模广告拦截 |

例如 `china.list` 的引用地址是：

```text
https://raw.githubusercontent.com/john-smith-matter/vpn_conf/main/china.list
```

修改 `.list` 并推送到 GitHub 即可。没有转换步骤、生成脚本、重复格式或需要手动刷新的上游快照。旧的 `china.yaml`、`youtube_api.yaml`、`youtube_cdn.yaml` 已合并为文本规则，相应配置 URL 已更新。

公共规则直接引用上游，同一个地址供四端使用：

- 国内应用：[blackmatrix7 China](https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/China/China.list)。
- Microsoft：[MetaCubeX Microsoft](https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/microsoft.list)。
- 公共 BT tracker：[MetaCubeX tracker](https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/category-public-tracker.list)。保留原来的拦截意图，与广告分别管理。
- 国内 IPv4/IPv6：[Loyalsoldier CN CIDR](https://raw.githubusercontent.com/Loyalsoldier/surge-rules/release/cncidr.txt)。

Mihomo / Stash 的 provider 使用 `behavior: classical`、`format: text`，每 86400 秒检查更新。Shadowrocket 使用 `RULE-SET,URL,策略`，在其原生配置更新设置中管理规则刷新。Mihomo 的 `path: ./rulesets/...` 是客户端下载缓存，仓库无需提供这些文件。

配置和规则先推送到本仓库的 `main` 分支，再更新客户端云端配置及规则；本地修改不会自动出现在 GitHub Raw 地址。

## 分流与 DNS

四端按同一顺序匹配：私网直连 → 广告和公共 BT tracker 拦截 → 明确代理域名 → Microsoft 代理 → 国内域名直连 → 国内 IP 直连 → 其余 `default`。Shadowrocket 在最前保留原生 Tailscale 规则。

| 查询对象 | 解析方式 |
| --- | --- |
| DNS 启动解析、代理节点域名、国内域名 | 223.5.5.5 / 223.6.6.6 的 DoH，直连 |
| 明确代理域名、未匹配域名 | 1.1.1.1 / 1.0.0.1 的 DoH，经 `default` |
| Mihomo / Stash 内网域名 | 系统 DNS |

Mihomo 使用 `respect-rules`，Stash 使用 `follow-rule`；节点域名使用独立解析以避免循环依赖。DNS 复用相同文本规则集中的域名条目，并将代理策略放在国内策略前，避免 `google.cn` 或 `download.microsoft.com` 被国内 DNS 策略覆盖。classical 集合中的 IP 条目不参与域名 DNS 策略。

Mihomo 保留 `redir-host` 和嗅探，Stash / Shadowrocket 保留 Fake-IP。私网 IP 和 DNS 上游 IP 规则带 `no-resolve`；国内 IP 兜底允许为未匹配域名解析真实地址。

Shadowrocket 使用 `direct-dns-server` 区分直连域名，并以 `#proxy=default` 指定境外 DoH 和加密备用 DNS 的出站。使用 `.lan`、`.home.arpa` 或内网反向解析时，在本地 `[Host]` 按实际网络补充 DNS，例如 `*.lan = server:192.168.1.1`。云端不假定路由器地址。

## 本地覆写

本地必须提供一个指向真实可用节点的 `default` 组，并保留云端的 DNS、rules / `[Rule]` 与 rule-providers。不要让空代理组或自动 `DIRECT` 回退改变代理流量的出站。

Mihomo 可在本地继续使用 `usa.yaml` 的 file provider；Stash 可使用其原生节点、订阅或 path provider。Shadowrocket 若希望跟随首页当前节点，可在本地添加：

```ini
[Proxy Group]
default = select,PROXY
```

Shadowrocket 的 Tailscale 策略要求在原生模块中启用并登录；Mihomo / Stash 的 tailnet 出站和 MagicDNS 由设备本地覆写提供。未使用原生 Tailscale 时，可在本地调整相应规则。

自定义文本规则无需添加策略，例如 `DOMAIN-SUFFIX,example.com`；策略由引用该规则集的客户端配置指定。例外放行规则应插在拦截规则之前。

## 语法依据

- [Mihomo DNS](https://wiki.metacubex.one/config/dns/)及[规则集](https://wiki.metacubex.one/config/rule-providers/)。
- [Stash DNS](https://stash.wiki/en/features/dns-server)及[规则集](https://stash.wiki/en/rules/rule-set/)；本配置使用其 rule-set DNS 策略，要求 iOS/tvOS 3.6+、macOS 4.3+。
- [Shadowrocket 官方版本说明](https://apps.apple.com/us/app/shadowrocket/id932747118)及[社区配置样例](https://github.com/LOWERTOP/Shadowrocket/blob/main/lazy_group.conf)。

已检查四端共同规则的 URL 和顺序、YAML 结构，并在合并临时本地代理组后进行 Mihomo 原生语法及隔离 DNS/路由验证。Stash、Shadowrocket 尚未进行原生应用导入实测。
