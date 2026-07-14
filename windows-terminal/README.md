# Windows Terminal 个性化配置

包含：

- PowerShell 7
- Oh My Posh 内置 `aliens` 主题
- ComicShannsMono + 小赖字体融合版（含 Nerd Font 图标）
- 会话、路径、Git 和 Python 状态块

## 资源

```text
resources/
├─ ComicXiaolaiNerdFontMono-Regular.otf   # 英文 ComicShannsMono，中文小赖字体
├─ blue-path.omp.json                     # 可选的自定义 Oh My Posh 主题
├─ LICENSE-COMICSHANNS-NERD-FONT.md
└─ LICENSE-XIAOLAI-OFL.txt
```

## 1. 安装 PowerShell 7

打开 [PowerShell Releases](https://github.com/PowerShell/PowerShell/releases/latest)，下载并运行适合电脑架构的 `.msi` 安装包，普通 64 位电脑选择：

```text
PowerShell-*-win-x64.msi
```

安装时建议勾选：添加到 PATH、注册事件日志、启用 Microsoft Update 更新。

## 2. 安装 Scoop

使用普通权限打开 PowerShell 7，执行：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
```

## 3. 安装终端工具

```powershell
scoop bucket add extras
scoop install PSReadLine posh-git oh-my-posh
```

## 4. 安装字体

打开 `resources/ComicXiaolaiNerdFontMono-Regular.otf`，点击“安装”。

然后打开 Windows Terminal：

```text
设置 → 配置文件 → PowerShell → 外观 → 字体
```

选择：

```text
Comic Xiaolai Nerd Font Mono
```

## 5. 安装主题

打开 PowerShell 配置文件：

```powershell
notepad $PROFILE
```

加入：

```powershell
Import-Module "$HOME\scoop\modules\posh-git"
& "$HOME\scoop\apps\oh-my-posh\current\oh-my-posh.exe" init pwsh --eval --config "$HOME\scoop\apps\oh-my-posh\current\themes\aliens.omp.json" | Invoke-Expression
```

保存后执行：

```powershell
. $PROFILE
```

主题中的 Powerline 符号和状态图标由 Nerd Font 字形渲染，不需要单独安装 SVG。

### 可选：使用仓库自带的蓝色主题

进入本目录后执行：

```powershell
New-Item "$HOME\Documents\PowerShell" -ItemType Directory -Force
Copy-Item ".\resources\blue-path.omp.json" "$HOME\Documents\PowerShell\blue-path.omp.json" -Force
```

然后将上面的 Oh My Posh 初始化命令替换为：

```powershell
& "$HOME\scoop\apps\oh-my-posh\current\oh-my-posh.exe" init pwsh --eval --config "$HOME\Documents\PowerShell\blue-path.omp.json" | Invoke-Expression
```

保留上面的 `Import-Module`，`aliens` 和蓝色主题的 Oh My Posh 初始化命令二选一，不要同时保留。

## 6. VS Code 可选配置

如果还需要 VS Code 集成终端使用同一字体，打开用户 `settings.json`，加入：

```json
{
  "terminal.integrated.fontFamily": "Comic Xiaolai Nerd Font Mono"
}
```

保存后按 `Ctrl+Shift+P`，执行 `Developer: Reload Window`。

> 如果由 Agent 执行，修改 VS Code 用户设置前必须先询问用户是否需要同步修改；得到确认后再操作。

## 注意

字体或图标没有立即生效时，关闭全部 Windows Terminal 和 VS Code 窗口，然后重新打开。
