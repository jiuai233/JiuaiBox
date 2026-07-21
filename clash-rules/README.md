# Clash Verge SSH 直连规则

[`ssh-direct.yaml`](./ssh-direct.yaml) 是 Clash Verge Rev 的单订阅规则增强文件，不是完整的 Clash 配置。

规则会优先直连：

- Windows OpenSSH：`ssh.exe`、`scp.exe`、`sftp.exe`；
- PuTTY：`plink.exe`、`putty.exe`；
- 目标端口为 `22` 的连接；
- `private-ip` 规则集匹配的私有网络地址。

它只修改当前订阅的路由规则，不会修改端口、DNS、IPv6、TUN、GEO 更新等全局设置。

## 使用

在 Clash Verge Rev 的配置页面找到目标订阅，打开“编辑规则”，将 `ssh-direct.yaml` 的内容复制进去并保存，然后重新选择该配置或重启 Clash Verge。

如果“编辑规则”中已有内容，只合并 `prepend` 下的规则，不要覆盖已有的 `append` 或 `delete`。

## 限制

使用其他 SSH 客户端且连接自定义端口时，需要再添加对应的 `PROCESS-NAME` 规则。仅靠端口规则无法识别任意端口上的 SSH 协议。
