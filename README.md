# Cordova crypt file plugin NextGen
This is an extension to [tkyaji's cordova-plugin-crypt-file](https://github.com/tkyaji/cordova-plugin-crypt-file) implementation to encrypt HTML assets during build and to decrypt the required assets during runtime.

The original implementation can also be found on https://www.npmjs.com/package/cordova-plugin-crypt-file.

## Requires 
node-rsa
`npm install -g node-rsa`

javascript-obfuscator
`npm install --save-dev javascript-obfuscator`

## Add Plugin
`cordova plugin add https://github.com/luhla/cordova-plugin-crypt-assets`

### Default

* .html
* .htm
* .js
* .css

### Edit subjects

You can specify the encryption subjects by editing `config.xml` instead of `plugin.xml`.

**config.xml**

```
<cryptfiles>
    <include>
        <file regex="\.(htm|html|js|css)$" />
    </include>
    <exclude>
        <file regex="exclude_file\.js$" />
    </exclude>
    <obfuscate value="release|always">
</cryptfiles>
```

Specify the target file as a regular expression.

## Encrypt
`cordova [build / prepare / run] android`

## Obfuscate
```
<obfuscate value="release">
```
obfuscation will be made when --release parametter present
`cordova [build / prepare / run] [ios / android] --release`

```
<obfuscate value="always">
```
obfuscation will be made always
`cordova [build / prepare / run] [ios / android]`

no value / other value / tag not present - no obfuscation

## Supported platforms
* Android - encrypt obfuscate
* iOS - obfuscate

## Before reporting your issue
It would be very helpful if you show me your project (If you have GitHub repository, that URL would be nice).
It is very hard for me to reporduce your enviroment.

## License
Apache version 2.0
