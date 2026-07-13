# Windows Terminal 个性化配置

包含：

- PowerShell 7
- Oh My Posh
- ComicShannsMono + 小赖字体融合版（含 Nerd Font 图标）
- 蓝色 Powerline 路径块
- 绿色 `❯` 命令提示符

## 资源

```text
resources/
├─ ComicXiaolaiNerdFontMono-Regular.otf   # 英文 ComicShannsMono，中文小赖字体
├─ blue-path.omp.json                     # Oh My Posh 主题
├─ LICENSE-COMICSHANNS-NERD-FONT.md
└─ LICENSE-XIAOLAI-OFL.txt
```

## 1. 安装 Oh My Posh

在 PowerShell 7 中执行：

```powershell
winget install JanDeDobbeleer.OhMyPosh -s winget
```

## 2. 安装字体

打开 `resources/ComicXiaolaiNerdFontMono-Regular.otf`，点击“安装”。

然后打开 Windows Terminal：

```text
设置 → 配置文件 → PowerShell → 外观 → 字体
```

选择：

```text
Comic Xiaolai Nerd Font Mono
```

## 3. 安装主题

进入本目录后执行：

```powershell
New-Item "$HOME\Documents\PowerShell" -ItemType Directory -Force
Copy-Item ".\resources\blue-path.omp.json" "$HOME\Documents\PowerShell\blue-path.omp.json" -Force
```

打开 PowerShell 配置文件：

```powershell
notepad $PROFILE
```

加入：

```powershell
oh-my-posh init pwsh --config "$HOME\Documents\PowerShell\blue-path.omp.json" | Invoke-Expression
```

保存后执行：

```powershell
. $PROFILE
```

## 4. VS Code 可选配置

在 VS Code 的 `settings.json` 中加入：

```json
{
  "terminal.integrated.fontFamily": "Comic Xiaolai Nerd Font Mono"
}
```

## 注意

字体或图标没有立即生效时，关闭全部 Windows Terminal 和 VS Code 窗口，然后重新打开。
