
可以加速github链接

部署说明
创建 Pages 项目： 将上述 _worker.js 文件提交到你的 Git 仓库的根目录。

连接 Cloudflare Pages： 在 Cloudflare 仪表板中，创建一个新的 Pages 项目，连接到你的 Git 仓库。

配置构建设置：

构建命令 (Build command): 不需要 (None)

构建输出目录 (Build output directory): 不需要 (None)

部署： 部署项目。Cloudflare Pages 会自动检测根目录下的 _worker.js 文件，并将其部署为 Pages Function，用于处理所有请求。

访问： 访问你的 Pages 域名，即可使用代理服务。根路径 https://你的域名/ 会显示简单的使用说明。


