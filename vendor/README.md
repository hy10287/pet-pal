# Cubism Core（不随仓库分发）

Live2D Cubism 4 Core（`live2dcubismcore.min.js`）受 Live2D 许可约束，**本仓库不会捆绑或再分发该文件**。

## 放置位置（唯一推荐方式）

把官方 SDK 中的文件放到：

```
vendor/live2dcubismcore.min.js
```

对应配置项：`config.cubismCorePath`（默认就是上面这条相对路径）。启动时会**优先**使用仓库内 `vendor/` 下的本地文件；渲染进程也会拒绝通过 `http(s)://` 远程注入 Core。

## 如何取得

1. 打开 [Cubism SDK for Web](https://www.live2d.com/sdk/download/web/) 并同意官方许可。
2. 解压 SDK，找到 `Core/live2dcubismcore.min.js`（路径因 SDK 版本可能略有不同）。
3. 复制到本仓库的 `vendor/` 目录。

不要把 Cubism Core 配成远程脚本 URL；请始终使用本地 `vendor/` 文件。
