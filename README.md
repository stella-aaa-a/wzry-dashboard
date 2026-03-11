# ⚔️ 王者热点看板

基于小红书/抖音收集的王者荣耀热点内容展示看板。

## 文件结构

```
wzry-dashboard/
├── index.html        # 热点看板主页面
├── upload.html       # 数据上传管理页
├── vercel.json       # Vercel 配置
└── data/
    └── memes.json    # 热点数据（自动更新）
```

## 部署步骤

1. 将此仓库导入 [Vercel](https://vercel.com)
2. 一键部署，获得 `xxx.vercel.app` 链接
3. 访问 `xxx.vercel.app/upload.html` 上传数据

## 数据收集

安装油猴脚本 `王者热点收集器.user.js`，去抖音/小红书搜索「王者荣耀」正常浏览，脚本自动收集满足热度门槛的内容：
- 抖音：3天内超过 2万赞
- 小红书：3天内超过 1万赞
