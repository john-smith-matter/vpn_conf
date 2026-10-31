# 代理客户端云端规则

四份配置通过 GitHub URL 导入。`clash_meta.yaml` 通过文件 provider 加载设备上的 `usa.yaml`；`clash_verge.yaml` 使用可独立校验的占位代理组，真实节点和代理组由 Verge 本地覆写提供，不需要 `usa.yaml`。Stash / Shadowrocket 的节点和 `default` 组由各自的本地配置补充。已有 `global_ext.js` 继续用于 Clash Verge 的设备专用网口规则。

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

## 代理节点如何接入

### Clash Meta / Mihomo

`clash_meta.yaml` 是完整配置，已恢复原来的节点入口：

```yaml
proxy-providers:
  usa:
    type: file
    path: ./usa.yaml
    health-check:
      enable: true
      url: https://www.gstatic.com/generate_204
      interval: 300

proxy-groups:
  - name: default
    type: fallback
    use: [usa]
    empty-fallback: REJECT
```

把真实节点保存在设备的 `usa.yaml`，其结构是 `proxies:` 数组。这是内核在运行时读取的外部节点数据，不需要客户端支持覆写；更新云端规则配置不会改写该文件。**路径相对于 Mihomo 数据目录（启动参数 `-d`），不是 GitHub URL，也不一定是配置文件所在目录。** 图形客户端可能使用其管理的配置资源目录，需要先确认它能导入该文件。

使用 provider 时，Meta 的主配置不必再重复定义 `proxies`。该云端文件自身已有完整的 provider、组及规则引用，下载后无需注入临时组即可通过内核配置校验。`empty-fallback: REJECT` 使空节点组不会自动退回直连；这不代表缺少节点时能够联网。

如果客户端无法向内核资源目录导入本地文件，就把云端配置里的 `usa` 改成 HTTP provider：

```yaml
proxy-providers:
  usa:
    type: http
    url: "填写实际节点订阅 URL"
    path: ./providers/usa.yaml
    interval: 3600
    proxy: DIRECT
    health-check:
      enable: true
      url: https://www.gstatic.com/generate_204
      interval: 300
```

节点 URL 与云端规则配置 URL 是两个独立资源。内核直接下载节点，客户端无需合并配置；`default` 仍使用 `[usa]`。HTTP provider 的下载走 `DIRECT`，避免首次启动时依赖尚未下载的节点。节点内容应为内核支持的代理集合，推荐使用包含 `proxies:` 数组的 Clash YAML。

HTTP 方式需要将实际节点 URL 写入该设备使用的配置；含私密令牌的订阅应放在私有配置来源。公开 GitHub 配置可以继续仅声明本地文件路径。若客户端既不能导入 provider 文件，也不能修改节点 URL，就需要使用已包含实际 provider 地址的完整私有配置，单独一份规则 URL 无法提供节点凭据。

### Clash Verge Rev

`clash_verge.yaml` 不使用文件 provider，也无需放置 `usa.yaml`。云端仅提供同步校验所需的有效结构：

```yaml
proxies: []
proxy-providers: {}
proxy-groups:
  - name: default
    type: select
    proxies: [REJECT]
```

在 Verge 的全局或订阅扩展配置中填写真实 `proxies` / `proxy-providers`，并用实际的 `default` 组替换云端占位组。例如，已有本地节点时，组写法如下：

```yaml
proxy-groups:
  - name: default
    type: select
    proxies: [本地节点名称]
```

将 `本地节点名称` 换成本地 `proxies` 中的实际 `name`；使用订阅 provider 时，改成 `use: [实际provider名称]`。Verge 的扩展配置会整体替换 `proxy-groups` 列表，因此本地需要的组都应写在该列表中。未添加本地节点配置时，`default` 拒绝代理流量，云端文件仍能通过同步语法校验。

`global_ext.js` 仅处理指定网口目标，不负责添加普通代理节点。Meta 的 `usa.yaml` 路径与 Verge 本地覆写是两套独立的接入方式。

### Stash / Shadowrocket

本地提供实际节点和 `default` 组，并保留云端 DNS、rules / `[Rule]` 与 rule-providers。Stash 可使用其原生节点、订阅或 path provider。Shadowrocket 若希望跟随首页当前节点，可在本地添加：

```ini
[Proxy Group]
default = select,PROXY
```

Shadowrocket 的 Tailscale 策略要求在原生模块中启用并登录；Mihomo / Stash 的 tailnet 出站和 MagicDNS 由设备本地覆写提供。未使用原生 Tailscale 时，可在本地调整相应规则。

自定义文本规则无需添加策略，例如 `DOMAIN-SUFFIX,example.com`；策略由引用该规则集的客户端配置指定。例外放行规则应插在拦截规则之前。

## 语法依据

- [Mihomo DNS](https://wiki.metacubex.one/config/dns/)及[规则集](https://wiki.metacubex.one/config/rule-providers/)。
- [Mihomo 代理集合](https://wiki.metacubex.one/config/proxy-providers/)及[代理组](https://wiki.metacubex.one/config/proxy-groups/)。
- [Clash Verge 扩展配置与脚本](https://www.clashverge.dev/guide/extend.html)。
- [Stash DNS](https://stash.wiki/en/features/dns-server)及[规则集](https://stash.wiki/en/rules/rule-set/)；本配置使用其 rule-set DNS 策略，要求 iOS/tvOS 3.6+、macOS 4.3+。
- [Shadowrocket 官方版本说明](https://apps.apple.com/us/app/shadowrocket/id932747118)及[社区配置样例](https://github.com/LOWERTOP/Shadowrocket/blob/main/lazy_group.conf)。

已检查四端共同规则的 URL 和顺序、YAML 结构及隔离 DNS/路由行为。两份 Clash 云端原文件均直接通过本机 Mihomo v1.19.32 的 `-t`；另验证了 Meta 文件 provider 的节点读取、Verge 未覆写时的拒绝行为以及本地覆写组的节点选择。Stash、Shadowrocket 尚未进行原生应用导入实测。
