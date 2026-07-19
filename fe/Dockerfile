FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.css background.js runtime-env.js robots.txt sitemap.xml /usr/share/nginx/html/
COPY vendor /usr/share/nginx/html/vendor
COPY fonts /usr/share/nginx/html/fonts
COPY js /usr/share/nginx/html/js

EXPOSE 80
