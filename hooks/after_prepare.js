module.exports = function(context) {

    var path              = require('path'),
        fs                = require('fs'),
        crypto            = require('crypto'),
        Q                 = require('q'),
        cordova_util      = context.requireCordovaModule('cordova-lib/src/cordova/util'),
        platforms         = context.requireCordovaModule('cordova-lib/src/platforms/platforms'),
        ConfigParser      = context.requireCordovaModule('cordova-common').ConfigParser,
        NodeRSA           = require('node-rsa'),
        isRelease         = context.cmdLine.indexOf('--release') > 0,
        JavaScriptObfuscator = require('javascript-obfuscator');
        
    var deferral = new Q.defer();
    var projectRoot = cordova_util.cdProjectRoot();

    var keypair = new NodeRSA();
    keypair.generateKeyPair(1024);
    var key = crypto.randomBytes(24).toString('base64');
    var iv = crypto.randomBytes(12).toString('base64');

    var publicKey = keypair.exportKey("pkcs8-public");
    console.log(publicKey);
    console.log(keypair.exportKey("pkcs8-private"));
    publicKey = publicKey.replace("-----BEGIN PUBLIC KEY-----", "");
    publicKey = publicKey.replace("-----END PUBLIC KEY-----", "");
    var publicKeyHexa = Buffer.from(publicKey).toString("hex");
    publicKeyHexa = publicKeyHexa.replace(/0a/g, "");
    publicKey = Buffer.from(publicKeyHexa, "hex").toString("ascii");
    var encryptedKey = keypair.encryptPrivate(key, "base64");
    var encryptedIv = keypair.encryptPrivate(iv, "base64");
    console.log('key(P)=' + key + ', iv(P)=' + iv)
    console.log('key(E)=' + encryptedKey + ', iv(E)=' + encryptedIv)

    var configXml = path.join(projectRoot, 'config.xml');
    var xmlHelpers = context.requireCordovaModule('cordova-common').xmlHelpers;
    var doc = xmlHelpers.parseElementtreeSync(configXml);
    var cryptfiles = doc.findall('cryptfiles');    
    var obfuscateSetting = getObfuscationSetting(cryptfiles);
    var toObfuscate = (obfuscateSetting=='always' || (obfuscateSetting=='release' && isRelease));

    var targetFiles = loadCryptFileTargets(cryptfiles);

    if (targetFiles.include.length==0 && targetFiles.exclude.length==0) {
        configXml = path.join(context.opts.plugin.dir, 'plugin.xml');
        doc = xmlHelpers.parseElementtreeSync(configXml);
        cryptfiles = doc.findall('cryptfiles');
        targetFiles = loadCryptFileTargets(cryptfiles);
    }
    
    context.opts.platforms.filter(function(platform) {
        var pluginInfo = context.opts.plugin.pluginInfo;
        return pluginInfo.getPlatformsArray().indexOf(platform) > -1;
        
    }).forEach(function(platform) {
        var platformPath = path.join(projectRoot, 'platforms', platform);
        var platformApi = platforms.getPlatformApi(platform, platformPath);
        var platformInfo = platformApi.getPlatformInfo();
        var wwwDir = platformInfo.locations.www;

        findCryptFiles(wwwDir).filter(function(file) {
            return isCryptFile(file.replace(wwwDir, ''));
        }).forEach(function(file) {
            var content = fs.readFileSync(file, 'utf-8');
            console.log('EncFile:' , file);
            var l_before = content.length;
            if (toObfuscate && l_before>0 && file.substr(-3) == '.js') {
                try {
                    content = JavaScriptObfuscator.obfuscate(content, {compact: true, controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.75}).getObfuscatedCode();
                } catch (e) {
                    console.log(e);
                }
                console.log('obfuscate:' , l_before,content.length, Math.round(content.length*100/l_before)+'%');
            }
            if (platform == 'android') {
                l_before = content.length;
                content = encryptData(content, key, iv)
                console.log('encrypt: ', l_before,content.length, Math.round(content.length*100/l_before)+'%');
            }

            fs.writeFileSync(file, content , 'utf-8');
        });

        if (platform == 'android') {
           // var pluginDir = path.join(platformPath, 'src');
            var pluginDir = platformInfo.locations.javaSrc;

            replaceCryptKey_android(pluginDir, encryptedKey, encryptedIv, publicKey);

            var cfg = new ConfigParser(platformInfo.projectConfig.path);
            cfg.doc.getroot().getchildren().filter(function(child, idx, arr) {
                return (child.tag == 'content');
            }).forEach(function(child) {
                child.attrib.src = '/+++/' + child.attrib.src;
            });

            cfg.write();
        }
    });

    deferral.resolve();
    return deferral.promise;


    function findCryptFiles(dir) {
        var fileList = [];
        var list = fs.readdirSync(dir);
        list.forEach(function(file) {
            fileList.push(path.join(dir, file));
        });
        // sub dir
        list.filter(function(file) {
            return fs.statSync(path.join(dir, file)).isDirectory();
        }).forEach(function(file) {
            var subDir = path.join(dir, file)
            var subFileList = findCryptFiles(subDir);
            fileList = fileList.concat(subFileList);
        });

        return fileList;
    }

    function loadCryptFileTargets(cryptfiles) {

        var include = [];
        var exclude = [];

        if (cryptfiles.length > 0) {
            cryptfiles[0]._children.forEach(function(elm) {
                elm._children.filter(function(celm) {
                    return celm.tag == 'file' && celm.attrib.regex && celm.attrib.regex.trim().length > 0;
                }).forEach(function(celm) {
                    if (elm.tag == 'include') {
                        include.push(celm.attrib.regex.trim());
                    } else if (elm.tag == 'exclude') {
                        exclude.push(celm.attrib.regex.trim());
                    }
                });
            })
        }

        return {'include': include, 'exclude': exclude};
    }

    function getObfuscationSetting(cryptfiles) {

        var toObfuscate = cryptfiles[0]._children.filter(obj => obj.tag=='obfuscate' );
        if (toObfuscate.length==0) {
            return false;
        }
        return toObfuscate[0].attrib.value || false;
        
    }

    function isCryptFile(file) {
        if (!targetFiles.include.some(function(regexStr) { return new RegExp(regexStr).test(file); })) {
            return false;
        }
        if (targetFiles.exclude.some(function(regexStr) { return new RegExp(regexStr).test(file); })) {
            return false;
        }
        return true;
    }

    function encryptData(input, key, iv) {
        var cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        var encrypted = cipher.update(input, 'utf8', 'base64') + cipher.final('base64');

        return encrypted;
    }

    function replaceCryptKey_android(pluginDir, encryptedKey, encryptedIv, publicPem) {
        var sourceFile = path.join(pluginDir, 'com/qhng/cordova/DecryptResourceNG.java');
        var content = fs.readFileSync(sourceFile, 'utf-8');

        var includeArrStr = targetFiles.include.map(function(pattern) { return '"' + pattern.replace('\\', '\\\\') + '"'; }).join(', ');
        var excludeArrStr = targetFiles.exclude.map(function(pattern) { return '"' + pattern.replace('\\', '\\\\') + '"'; }).join(', ');

        content = content.replace(/_CRYPT_KEY = ".*";/, '_CRYPT_KEY = "' + encryptedKey + '";')
                         .replace(/_CRYPT_IV = ".*";/, '_CRYPT_IV = "' + encryptedIv + '";')
                         .replace(/PUBLIC_PEM = ".*";/, 'PUBLIC_PEM = "' + publicPem + '";')
                         .replace(/INCLUDE_FILES = new String\[\] {.*};/, 'INCLUDE_FILES = new String[] { ' + includeArrStr + ' };')
                         .replace(/EXCLUDE_FILES = new String\[\] {.*};/, 'EXCLUDE_FILES = new String[] { ' + excludeArrStr + ' };');

        fs.writeFileSync(sourceFile, content, 'utf-8');
    }
}
