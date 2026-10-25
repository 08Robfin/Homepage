'use strict';
const fs = require('node:fs');
const path = require('node:path');

module.exports = function contentMiddleware(app, express) {
  const data = process.env.CMS_DATA_DIR || path.join(require('node:os').homedir(), '.local/share/robfin-cms');
  const routes = {'/':'home','/index.html':'home','/setup':'setup','/setup/':'setup','/setup/index.html':'setup','/Hosting':'Hosting','/Hosting/':'Hosting','/Hosting/index.html':'Hosting','/3dprint':'3dprint','/3dprint/':'3dprint','/3dprint/index.html':'3dprint'};
  app.get('/cms-client.js', (req,res) => res.sendFile(path.join(__dirname,'public-client.js')));
  app.use('/cms-media', express.static(path.join(data,'uploads'), {dotfiles:'deny',index:false,immutable:true,maxAge:'1y',setHeaders:res=>res.setHeader('X-Content-Type-Options','nosniff')}));
  app.use((req,res,next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const id = routes[req.path];
    if (!id) return next();
    fs.readFile(path.join(data,'published/CURRENT'),'utf8',(error,version) => {
      if (error) return next(); // Existing static site remains available before first initialization.
      if (!/^[a-zA-Z0-9-]+$/.test(version.trim())) return next();
      const file = path.join(data,'published',version.trim(),id+'.html');
      fs.readFile(file,(error,body) => {
        if (error) return next();
        res.set('Cache-Control','no-store');
        res.set('X-Content-Type-Options','nosniff');
        res.type('html').send(body);
      });
    });
  });
};
