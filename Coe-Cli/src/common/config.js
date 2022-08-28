"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const { exec } = require('child_process');
class Config {
    static async init() {
        if (Config.configSetup) {
            return;
        }
        if (Object.keys(Config.data).length == 0) {
            let configFile = path_1.default.resolve(path_1.default.join(__dirname, "..", "..", "..", "config", "config.json"));
            Config.data = JSON.parse(fs_1.default.readFileSync(configFile, "utf-8"));
        }
        let configDevFile = path_1.default.resolve(path_1.default.join(__dirname, "..", "..", "..", "config", "config.dev.json"));
        if (fs_1.default.existsSync(configDevFile)) {
            let devConfig = JSON.parse(fs_1.default.readFileSync(configDevFile, "utf-8"));
            let devKeys = Object.keys(devConfig);
            for (let i = 0; i < devKeys.length; i++) {
                await this.copyValue(devConfig, Config.data, devKeys[i]);
            }
        }
        await this.replaceValues(Config.data);
        Config.configSetup = true;
    }
    static async copyValue(from, to, key) {
        if (typeof to[key] === "undefined") {
            to[key] = from[key];
        }
        if (typeof to[key] === "object" && typeof from[key] === "object") {
            let fromKeys = Object.keys(from[key]);
            for (var i = 0; i < fromKeys.length; i++) {
                this.copyValue(from[key], to[key], fromKeys[i]);
            }
            return;
        }
        to[key] = from[key];
    }
    static async replaceValues(data, parent = null) {
        let configKeys = Object.keys(data);
        // Replace values in child objects
        for (let i = 0; i < configKeys.length; i++) {
            if (typeof data[configKeys[i]] == "object") {
                await this.replaceValues(data[configKeys[i]], parent != null ? parent : data);
            }
        }
        for (let i = 0; i < configKeys.length; i++) {
            let key = configKeys[i];
            let configRegexp = new RegExp(/\{config:(?<name>.*?)\}/, 'i');
            if (configRegexp.test(data[key])) {
                let match = configRegexp.exec(data[key]).groups;
                let replacement = parent != null ? parent : data;
                data[key] = data[key].replace("{config:" + match["name"] + "}", replacement[match["name"]]);
            }
        }
        for (let i = 0; i < configKeys.length; i++) {
            let key = configKeys[i];
            let envRegexp = new RegExp(/\{env:(?<name>.*?)\}/, 'i');
            if (envRegexp.test(data[key])) {
                let match = envRegexp.exec(data[key]).groups;
                let envValue = process.env[match["name"]];
                data[key] = data[key].replace("{env:" + match["name"] + "}", envValue);
            }
        }
        for (let i = 0; i < configKeys.length; i++) {
            let key = configKeys[i];
            let secretRegexp = new RegExp(/\{secret:(?<name>.*?)\}/, 'i');
            if (secretRegexp.test(Config.data[key])) {
                let match = secretRegexp.exec(Config.data[key]).groups;
                data[key] = data[key].replace("{secret:" + match["name"] + "}", await this.getPipelineSecret(match["name"], data["deploymentSecrets"]));
            }
        }
    }
    static async getPipelineSecret(name, vault) {
        let exists = JSON.parse(await this.runCommand(`az keyvault secret list --vault-name ${vault} --query "contains([].id, 'https://${vault}.vault.azure.net/secrets/${name}')"`));
        if (exists) {
            let json = await this.runCommand(`az keyvault secret show --name "${name}" --vault-name "${vault}"`);
            Config.data[name] = (JSON.parse(json)).value;
            return Config.data[name];
        }
        return null;
    }
    static async runCommand(command, resultOnly = false) {
        return await new Promise((resolve, reject) => {
            exec(command, (err, stdout, stderr) => {
                if (err) {
                    if (resultOnly) {
                        resolve("false");
                    }
                    else {
                        reject(err);
                    }
                    return;
                }
                if (resultOnly) {
                    resolve("true");
                }
                else {
                    resolve(stdout);
                }
            });
        });
    }
}
exports.Config = Config;
Config.configSetup = false;
Config.data = {};
//# sourceMappingURL=config.js.map