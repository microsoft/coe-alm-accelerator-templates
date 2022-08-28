"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandLineHelper = void 0;
const child_process_1 = require("child_process");
const prompt_1 = require("./prompt");
class CommandLineHelper {
    constructor() {
        this.prompt = new prompt_1.Prompt();
    }
    async validateAzCliReady(args) {
        var _a, _b, _c;
        let validated = false;
        while (!validated) {
            let accounts;
            try {
                accounts = JSON.parse(await this.runCommand('az account list', false));
            }
            catch (_d) {
                accounts = [];
            }
            // Check if tenant assigned
            if (typeof (args.subscription) == "undefined" || (args.subscription.length == 0)) {
                if (accounts.length == 0) {
                    // No accounts are available probably not logged in ... prompt to login
                    let ok = await this.prompt.yesno('You are not logged into an account. Try login now (Y/n)?', true);
                    if (ok) {
                        await this.runCommand('az login --use-device-code --allow-no-subscriptions', true);
                    }
                    else {
                        return Promise.resolve(false);
                    }
                }
                if (accounts.length > 0) {
                    let defaultAccount = accounts.filter((a) => (a.isDefault));
                    if (accounts.length == 1) {
                        // Only one accounr assigned to the user account use that
                        args.subscription = accounts[0].id;
                    }
                    if (defaultAccount.length == 1 && accounts.length > 1) {
                        // More than one account assigned to this account .. confirm if want to use the current default tenant
                        let ok = await this.prompt.yesno(`Use default tenant ${defaultAccount[0].tenantId} in account ${defaultAccount[0].name} (Y/n)?`, true);
                        if (ok) {
                            // Use the default account
                            args.subscription = defaultAccount[0].id;
                        }
                    }
                    if (typeof (args.subscription) == "undefined" || (args.subscription.length == 0)) {
                        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Missing account, run az account list to and it -a argument to assign the account");
                        return Promise.resolve(false);
                    }
                }
            }
            if (accounts.length > 0) {
                let match = accounts.filter((a) => (a.id == args.subscription || a.name == args.subscription) && (a.isDefault));
                if (match.length != 1) {
                    (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info(`${args.subscription} is not the default account. Check you have run az login and have selected the correct default account using az account set --subscription`);
                    (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info('Read more https://docs.microsoft.com/cli/azure/account?view=azure-cli-latest#az_account_set');
                    return Promise.resolve(false);
                }
                else {
                    return Promise.resolve(true);
                }
            }
        }
    }
    runCommand(command, displayOutput) {
        return new Promise((resolve, reject) => {
            let child = (0, child_process_1.exec)(command, (error, stdout, stderr) => {
                var _a, _b;
                if (error) {
                    (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(`exec error: ${error}`);
                    reject(error);
                }
                if (displayOutput) {
                    (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info(stdout);
                }
                let text = stdout.replace(/^\s*[\r\n]/gm, "\n");
                text = text.replace(/^\s*[\n]/gm, "\n");
                var array = text.split("\n");
                let data = '';
                for (var i = 0; i < array.length; i++) {
                    let line = array[i];
                    if (!(line === null || line === void 0 ? void 0 : line.trim().startsWith("WARNING"))) {
                        data = data + '\n' + line;
                    }
                }
                resolve(data);
            });
            child.on("error", () => reject);
        });
    }
}
exports.CommandLineHelper = CommandLineHelper;
//# sourceMappingURL=cli.js.map