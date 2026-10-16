# MyGallery 个人作品画廊

MyGallery 是一个本机离线运行的个人作品管理网页。界面由 React、TypeScript 和 Vite 提供，本地 API 使用 Express 与 sql.js 保存资料；作品原图和数据库只留在当前电脑上。

## 网页端启动

需要先安装 Node.js 和 npm。在项目目录运行：

```powershell
npm install
```

之后可以双击 `启动服务.bat`，脚本会在本机启动前后端并打开浏览器，地址为 `http://127.0.0.1:5173/`。关闭浏览器不会停止服务；需要停止时双击 `停止服务.bat`。也可以在终端运行 `npm run dev`，再自行打开上述地址。

## 功能

- 管理作品标题、日期、长篇创作手记、标签和多张原图；图片可排序并指定封面。
- 作品可以归属多个分类；侧栏分类筛选一次选择一个分类，也可叠加标签筛选。
- 在分类管理中把已有作品加入分类；在分类作品页进入「管理分类」，可勾选作品并从当前分类移出，作品和其他分类关联会保留。
- 首页精选区可从已有已发布作品中选择最多 3 件，并调整顺序。
- 搜索标题、手记和标签；支持收藏、排序、网格密度、分页和批量操作。
- 详情查看器支持缩放、原尺寸、切图、网页全屏；长篇手记默认折叠并可展开。
- 回收站支持还原、永久删除和清空确认；设置中提供资料库备份、还原与完整性检查。
- 文件夹导入可按图片或子文件夹创建作品，并检查重复文件。

## 开发命令

```powershell
npm run dev       # 启动本地网页与 API
npm run build     # TypeScript 检查并构建网页到 dist/
npm test          # 运行本地数据、API 与安全边界测试
npm run seed       # 仅在空的开发资料库中导入示例，不覆盖已有作品
```

`npm install` 后也可以直接使用根目录的启动和停止 BAT 文件。`.service/` 保存启动日志。`dist/` 和 `release/` 是可重新生成的构建产物，不是网页运行所需的源码。

## 本地资料库

开发模式的数据保存在项目目录下的 `gallery.db`、`config.json`、`images/`、`thumbnails/`、`staging/` 和 `backups/`。这些内容属于本机作品资料，不应提交到 Git。项目的 `.gitignore` 已排除资料库、原图、缩略图、备份、缓存和发行包。

## 示例图片来源

示例图片来自 [The Metropolitan Museum of Art Open Access](https://www.metmuseum.org/about-the-met/policies-and-documents/open-access)，官方 API 标注为公有领域（CC0）。来源记录见 `public/samples/credits.json`；应用使用本地副本，不会在运行时联网。

安全实现参考 [Electron 官方安全指南](https://www.electronjs.org/docs/latest/tutorial/security)。界面设计决策见 `design-system/MASTER.md`，完整需求见 `MyGallery_PRD_v1.1.md`。