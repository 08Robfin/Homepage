const path = require('node:path');
module.exports = {apps:[{
  name:'robfin-editor',script:path.join(__dirname,'server.py'),interpreter:'python3',
  cwd:__dirname,watch:false,autorestart:true,max_restarts:10,restart_delay:2000,
  env:{CMS_BIND:'10.0.0.87',CMS_PORT:'8765',CMS_DATA_DIR:'/home/robfin/.local/share/robfin-cms',PYTHONUNBUFFERED:'1'}
}]};
