const path = require('node:path');
module.exports={apps:[{
  name:'robfin-app',script:path.join(__dirname,'../server.js'),cwd:path.join(__dirname,'..'),
  watch:false,autorestart:true,restart_delay:1000,
  env:{CMS_DATA_DIR:'/home/robfin/.local/share/robfin-cms'}
}]};
