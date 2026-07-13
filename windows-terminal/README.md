# Windows Terminal 个性化配置

包含：

- PowerShell 7
- Oh My Posh
- Meatshell Mono Nerd Font
- 蓝色 Powerline 路径块
- 绿色 `❯` 命令提示符

## 资源

```text
resources/
├─ MeatshellMonoNerdFontMono-Regular.ttf  # 已加入 Nerd Font 图标的字体
└─ blue-path.omp.json                     # Oh My Posh 主题
```

## 1. 安装 Oh My Posh

在 PowerShell 7 中执行：

```powershell
winget install JanDeDobbeleer.OhMyPosh -s winget
```

## 2. 安装字体

打开 `resources/MeatshellMonoNerdFontMono-Regular.ttf`，点击“安装”。

然后打开 Windows Terminal：

```text
设置 → 配置文件 → PowerShell → 外观 → 字体
```

选择：

```text
MeatshellMono Nerd Font Mono
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
  "terminal.integrated.fontFamily": "MeatshellMono Nerd Font Mono"
}
```

## 注意

字体或图标没有立即生效时，关闭全部 Windows Terminal 和 VS Code 窗口，然后重新打开。
