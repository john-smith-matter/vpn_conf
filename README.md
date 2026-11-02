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

三份 YAML 均开启顶层 `ipv6: true` 和 `dns.ipv6: true`；Shadowrocket 使用原生的 `ipv6 = true`。这样允许连接只有 AAAA 记录的节点，也允许应用获得 AAAA 响应。IPv4 地址的 DoH 服务器同样能返回 AAAA，不需要为了打开 IPv6 而更换 DNS 地址。

| 客户端 | 云端配置 | 客户端中需要确认 |
| --- | --- | --- |
| Clash Meta for Android | 两级 IPv6 均开启；保留本地 usa 文件 provider；不配置 `tun` | 网络设置开启“允许 IPv6”；需要受控的应用不能被排除；关闭“允许绕过”可限制应用主动绕开 VPN |
| Clash Verge Rev | 两级 IPv6 均开启；`tun` 仅保留 IPv6 接口地址 `inet6-address` | 应用设置中启用 IPv6 和 TUN，并按下表保存 TUN 参数；核对 DNS 覆写没有改变预期的解析配置 |
| Stash | 两级 IPv6 均开启 | 网络设置开启“启用 Tunnel IPv6 路由”，使 IPv6 字面量连接也进入 TUN |
| Shadowrocket | `ipv6 = true`；公共 IPv6 未加入旁路路由 | 使用配置分流，保留云端规则及 `FINAL,default`，不在本地另加公共 IPv6 的旁路网段 |

仅靠 IPv6 DNS 开关不能保证接管路由。Android 的 VPN 本身通过 TUN 接口接管流量，VPN 地址、路由和应用访问控制由客户端的 [TunService](https://github.com/MetaCubeX/ClashMetaForAndroid/blob/main/service/src/main/java/com/github/kr328/clash/service/TunService.kt)管理；CMFA 会[关闭订阅的原生 TUN](https://github.com/MetaCubeX/ClashMetaForAndroid/blob/main/core/src/main/golang/native/config/process.go)，所以 `clash_meta.yaml` 不再保留 `tun` 段，顶层 `dns` 仍用于内核解析。Stash 也明确要求为直接 IPv6 TUN 流量打开[独立的 IPv6 路由选项](https://stash.wiki/en/faq/ipv6-compatible)。

Verge 的 `tun.enable` 始终由应用控制；在 TUN 设置中保存过的字段会覆盖订阅，并在扩展执行后回写，扩展配置或脚本也不能强制覆盖。未被应用接管的字段仍可由订阅提供。为统一管理，本仓库将自动路由、严格路由、DNS 劫持和路由排除移到客户端，仅在订阅中保留未被 TUN 设置接管的 `inet6-address`。此地址用于 IPv6 TUN 接口，不会自行开启 TUN 或添加所需路由。详见[应用设置优先级](https://www.clashverge.dev/guide/extend.html#与应用设置的优先级)。

使用 `clash_verge.yaml` 时，在 Verge 应用设置中启用 IPv6，并在 TUN 设置中保存以下值：

| 客户端设置 | 值 |
| --- | --- |
| TUN 开关（`tun.enable`） | 开启 |
| 自动路由（`auto-route`） | `true` |
| 自动检测出口网卡（`auto-detect-interface`） | `true` |
| 严格路由（`strict-route`） | `true` |
| DNS 劫持（`dns-hijack`） | `any:53` 和 `tcp://any:53`，分别表示 UDP / TCP 53 端口 |
| 路由排除（`route-exclude-address`） | `100.64.0.0/10` 和 `fd7a:115c:a1e0::/48`，供系统 Tailscale 路由处理 |

保存后，在订阅页通过“查看运行时订阅”核对上述值，以及订阅保留的 `tun.inet6-address: ['fdfe:dcba:9876::1/126']`。这些客户端设置不会随本仓库订阅同步，需要在每台设备上配置。

已进入内核的 IPv6 流量仍按现有规则匹配：私网和国内地址直连，其余落到 `MATCH,default` / `FINAL,default`。共享国内 IP 上游含 IPv4 和 IPv6，私网列表仅列出明确的本地范围，没有把整个公共 IPv6 网段直连或排除出隧道。已有意设置的国内和私网直连属于分流策略，开启 IPv6不会额外添加直连规则。本机 Mihomo v1.19.32 已验证纯 AAAA 节点连接、应用 AAAA 响应以及公共 IPv6 字面量目标经代理转发；这不代替在各设备上确认实际 VPN 路由。设备底层网络也需要能到达节点的 IPv6 地址。

Shadowrocket 使用 `direct-dns-server` 区分直连域名，并以 `#proxy=default` 指定境外 DoH 和加密备用 DNS 的出站。使用 `.lan`、`.home.arpa` 或内网反向解析时，在本地 `[Host]` 按实际网络补充 DNS，例如 `*.lan = server:192.168.1.1`。云端不假定路由器地址。

### Tailscale 直连（两份 Mihomo 配置）

`clash_meta.yaml` 与 `clash_verge.yaml` 均启用 `find-process-mode: always`，在远程规则集之前添加 Tailscale 进程 / 包名直连规则，覆盖 Windows 的 `tailscaled.exe`、`tailscale.exe`、`tailscale-ipn.exe`，macOS 的命令行守护进程、`Tailscale`、`IPNExtension` 和两种 Network Extension，以及 Android 的 `com.tailscale.ipn`。进程匹配负责覆盖变化的公网 peer IP；仅放行 `100.x`、`ts.net` 或固定服务器 IP 不能覆盖这些底层连接。

两份配置还独立直连 `tailscale.com`、`tailscale.io`、`ts.net` 和 tailnet IPv4/IPv6 网段。前两个域名使用显式 `#DIRECT` 的国内 DoH，避免 Tailscale 的控制连接依赖 `default` 代理才能解析。`ts.net` 默认交给系统 DNS；设备必须已有可用的 Tailscale DNS，或用本地覆写指定 MagicDNS 的实际出口。现有 `global_ext.js` 生成的 `100.100.100.100#tailscale-direct` 策略仍可优先使用。

Verge 桌面端需要在客户端 TUN 设置中排除 `100.64.0.0/10` 和 `fd7a:115c:a1e0::/48`，由系统 Tailscale 路由处理，并设置 `strict-route: true`，优先保留 Windows 普通 DNS 的防泄漏过滤。这些参数已移出订阅，必须按上表在客户端保存。关闭严格路由会允许本可被过滤的 DNS 请求经其他网卡发出，单靠 `dns-hijack` 不能覆盖所有这些请求。它不是所有 TCP/UDP 流量的通用防绕过开关，也不改变规则中有意设置的 `DIRECT`。Tailscale 的进程、域名和网段例外仍保留在订阅中，不为兼容 MagicDNS 放宽严格路由。CMFA 的 VPN 路由由 Android 客户端管理，不使用这些桌面 TUN 参数。

Windows 上 Tailscale 在适用的 DNS 模式下会向系统 hosts 写入 tailnet 名称。应用通过系统解析器命中这些记录，或 Mihomo 使用默认启用的 `dns.use-system-hosts` 命中系统 hosts 时，不需要向 MagicDNS 发起查询，严格路由不会阻断这一解析路径。hosts 写入受 DNS 模式和客户端设置等条件限制，主动查询 DNS 的工具也可能绕过 hosts；因此不保证所有 MagicDNS 查询均不受影响。tailnet 网段的路由排除不等于 Windows DNS 防火墙例外，保留严格路由可能影响直接查询 `100.100.100.100:53`；此处接受该兼容性风险，可使用 Tailscale IP 或已写入 hosts 的名称。

平台生效条件：

- Windows / macOS：客户端需要有识别本机连接进程的权限；查看连接日志，确认对应进程命中 `DIRECT`。本地覆写应保留这些规则和 `find-process-mode: always`，运行模式保持 `rule`。Verge 的 TUN 排除项和 `strict-route: true` 应在客户端 TUN 设置中保存，并通过运行时订阅确认；不能依靠扩展覆盖已被应用接管的字段。全局或节点级 `interface-name` 仍需指向实际可用的出口；共享配置不固定 WLAN、以太网或 macOS 网卡名。
- Android：包名规则需要客户端能提供应用归属；CMFA 的应用访问控制也可将 Tailscale 排除在其 VPN 外。**普通 Android 同一用户/工作资料只能有一个活动 VPN，排除应用或添加 YAML 规则都不能让官方 Tailscale VPN 与 CMFA VPN 同时运行。** 如需同时使用，应采用由同一客户端集成 tailnet 的方案，或把其中一个放到路由器/其他设备上；本配置不自动建立新的 Tailscale 出站。
- 进程识别失败时，域名规则只能保护对应主机名，无法穷举所有动态 peer IP、自建 DERP 或 Headscale。自建服务应在本地补充直连域名及其直连 DNS 策略。仅配置文件校验通过不代表三个平台的进程识别均已实测。
- 这里针对未启用 Tailscale exit node 的共存方式；exit node 会额外接管默认路由和防火墙规则，需要单独验证，不由这些分流规则保证。

本次两份云端 YAML 均通过本机 Mihomo v1.19.32 的原文件 `-t` 校验；新增 Tailscale 分流尚未完成运行时验证，macOS / Android 未实机测试。

依据：[Mihomo 进程匹配模式](https://wiki.metacubex.one/config/general/#进程匹配模式)、[进程规则](https://wiki.metacubex.one/config/rules/#process-name)、[TUN](https://wiki.metacubex.one/config/inbound/tun/)、[系统 hosts 查询](https://wiki.metacubex.one/config/dns/#use-system-hosts)、[Tailscale Windows hosts 实现](https://github.com/tailscale/tailscale/blob/v1.104.2/net/dns/manager_windows.go)、[Tailscale 守护进程和 macOS 变体](https://tailscale.com/docs/reference/tailscaled)、[官方进程列表](https://tailscale.com/docs/integrations/firewalls)、[Android VPN 限制](https://developer.android.com/develop/connectivity/vpn)、[其他 VPN / exit node 共存限制](https://tailscale.com/docs/reference/faq/other-vpns)。

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

把真实节点保存在设备的 `usa.yaml`，其结构是 `proxies:` 数组。这是运行时读取的外部节点数据，不需要客户端支持覆写。**Clash Meta for Android 会将 `path: ./usa.yaml` 重写到当前配置的 `providers/usa.yaml`，需要通过该配置的文件管理入口导入 provider 资源文件。** 普通桌面 Mihomo 则相对于其数据目录（启动参数 `-d`）解析路径；不能把这个桌面路径规则直接套用到 Android。此目录处理可在 [Android 官方源码](https://github.com/MetaCubeX/ClashMetaForAndroid/blob/main/core/src/main/golang/native/config/process.go)中核对。

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
