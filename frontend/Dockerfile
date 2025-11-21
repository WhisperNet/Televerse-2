FROM nginx:1.27-alpine

# Copy static files
COPY . /usr/share/nginx/html/

# Copy custom nginx config for SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

