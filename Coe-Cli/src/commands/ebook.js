"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EbookCommand = exports.EbookArguments = void 0;
const marked = __importStar(require("marked"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const { EOL } = require('os');
const slash_1 = __importDefault(require("slash"));
const normalize_url_1 = __importDefault(require("normalize-url"));
/**
 * Ebook commands
 */
class EbookCommand {
    constructor(logger, defaultFs = null) {
        this.logger = logger;
        if (defaultFs == null) {
            this.readFile = fs.promises.readFile;
            this.writeFile = fs.promises.writeFile;
            this.existsSync = fs.existsSync;
        }
        else {
            this.readFile = defaultFs.readFile;
            this.writeFile = defaultFs.writeFile;
            this.existsSync = defaultFs.existsSync;
        }
        this.outputText = (text) => console.log(text);
    }
    /**
     * Create the e-book content
     * @param args
     * @returns
     */
    async create(args) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        let content = ['<html><head><link href="prism.css" rel="stylesheet" /><link href="book.css" rel="stylesheet" /></head><body><img class="cover" src="./images/ebook-cover.png" />'];
        let toc = ['<div class="page"><ul class="toc">'];
        let tocLevels = [];
        for (let l = 0; l < args.tocLevel; l++) {
            tocLevels.push(0);
        }
        marked.marked.use({
            pedantic: false,
            gfm: true,
            breaks: false,
            sanitize: false,
            smartLists: true,
            smartypants: false,
            xhtml: false
        });
        let docsPath = args.docsPath;
        if (!path.isAbsolute(docsPath)) {
            docsPath = path.normalize(path.join(__dirname, '..', '..', '..', docsPath));
        }
        else {
            docsPath = path.normalize(docsPath);
        }
        let indexFile = path.join(docsPath, "index.txt");
        if (!this.existsSync(indexFile)) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(`Unable to find index file ${indexFile}`);
            return Promise.resolve();
        }
        let data = await this.readFile(indexFile, 'utf-8');
        const lines = data.split(/\r?\n/);
        let fileReferences = {};
        let links = [];
        for (var i = 0; i < lines.length; i++) {
            content.push('<div class="page">');
            if (lines[i].startsWith("#") || ((_b = lines[i]) === null || _b === void 0 ? void 0 : _b.trim().length) == 0) {
                // Skip comment or empty line
                continue;
            }
            let file = path.normalize(path.join(docsPath, lines[i]));
            let md = await this.readFile(file, 'utf-8');
            let tokens = marked.Lexer.lex(md);
            let fileid = lines[i].replace(/\//g, '-').replace(".md", '');
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug(`Importing ${file}`);
            fileReferences[fileid] = [];
            marked.marked.walkTokens(tokens, (token) => {
                var _a, _b, _c, _d, _e;
                if (token.type == "image") {
                    if (!path.isAbsolute(token.href) && !token.href.startsWith('http')) {
                        let relativePath = path.normalize(path.join(path.dirname(file), token.href));
                        relativePath = "." + relativePath.replace(docsPath, "").replace(/\\/g, '/');
                        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Updating image from ${token.href} to ${relativePath}`);
                        token.href = relativePath;
                    }
                }
                if (token.type == "link") {
                    if (token.href.startsWith("#")) {
                        let oldLink = token.href;
                        token.href = "#" + fileid + "-" + token.href.replace("#", "").replace(/ /g, '-');
                        if (fileReferences[fileid].indexOf(token.href) < 0) {
                            fileReferences[fileid].push(token.href);
                        }
                        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`Updating markdown link ${oldLink} to ${token.href}`);
                        return;
                    }
                    if (token.href.indexOf(".md") > 0 && !token.href.startsWith('http')) {
                        let reference = token.href;
                        let fileName = reference.indexOf("#") > 0 ? reference.split('#')[0] : reference;
                        let section = reference.indexOf("#") > 0 ? reference.split('#')[1] : "";
                        let targetFile = path.normalize(path.join(path.dirname(file), fileName));
                        let relativeFile = targetFile.replace(docsPath, "");
                        // Change to unix like path
                        relativeFile = relativeFile.replace(/\\/g, '/');
                        if (relativeFile.startsWith('/')) {
                            relativeFile = relativeFile.substr(1);
                        }
                        let newReference = "";
                        if (section.length == 0) {
                            // Not a reference fo an internal part of the file
                            // Assume link is to the start of the file
                            newReference += "#section-";
                        }
                        newReference += relativeFile.replace(/\//g, '-').replace(".md", "");
                        if (section.length > 0) {
                            // Add link to heaing inside the document
                            newReference += "-" + section.toLowerCase().replace(/ /g, '-');
                        }
                        (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug(`Updating markdown link ${token.href} to ${newReference}`);
                        if (fileReferences[fileid].indexOf(newReference) < 0) {
                            fileReferences[fileid].push(newReference);
                        }
                        token.href = newReference;
                        return;
                    }
                    if (!path.isAbsolute(token.href) && !token.href.startsWith('http')) {
                        let href = marked.Lexer.lex(token.raw.replace(/\\/g, '/'))[0].tokens[0].href;
                        let relativePath = (0, slash_1.default)(path.normalize(path.join(path.dirname(file), href)));
                        let offset = "./";
                        let commonPath = docsPath;
                        // Assume that in docs path
                        relativePath = relativePath.replace(docsPath, "");
                        // Check if still have absolute path
                        while (path.isAbsolute(relativePath)) {
                            // Move up one folder
                            offset += "../";
                            commonPath = (0, slash_1.default)(path.normalize(path.join(commonPath, "..")));
                            // Try remove new common path folder
                            relativePath = relativePath.replace(commonPath, "");
                            if (relativePath.startsWith('/')) {
                                relativePath = relativePath.substr(1);
                            }
                        }
                        let newPath = ".";
                        if (((_d = args.repoPath) === null || _d === void 0 ? void 0 : _d.length) > 0) {
                            newPath = args.repoPath;
                            if (!newPath.endsWith('/')) {
                                newPath += '/';
                            }
                            relativePath = (0, normalize_url_1.default)(newPath + offset + relativePath);
                        }
                        else {
                            relativePath = newPath + relativePath;
                        }
                        if (fileReferences[fileid].indexOf(relativePath) < 0) {
                            fileReferences[fileid].push(relativePath);
                        }
                        (_e = this.logger) === null || _e === void 0 ? void 0 : _e.debug(`Updating link from ${href} to ${relativePath}`);
                        token.href = relativePath;
                    }
                }
            });
            const renderer = new marked.Renderer();
            renderer.heading = (text, level) => {
                const escapedText = "#" + fileid + '-' + text.toLowerCase().replace(/[^\w]+/g, '-');
                if (links.indexOf(escapedText) < 0) {
                    links.push(escapedText);
                }
                if (level <= args.tocLevel) {
                    if (level < args.tocLevel) {
                        for (let l = level; l < args.tocLevel; l++) {
                            tocLevels[l] = 0;
                        }
                    }
                    tocLevels[level - 1] = tocLevels[level - 1] + 1;
                    let label = '';
                    for (let l = 0; l < level; l++) {
                        if (label.length > 0) {
                            label += ".";
                        }
                        label += tocLevels[l];
                    }
                    toc.push(`<li class="toc-${level}"><a href="${escapedText}">${label} ${text}</a><li>`);
                }
                return `
<h${level}>
    <a id="${escapedText.replace("#", "")}" class="anchor">
        <span class="header-link"></span>
    </a>
    ${text}
</h${level}>`;
            };
            const parser = new marked.Parser({ renderer: renderer });
            let html = parser.parse(tokens);
            let fileReference = `section-${fileid}`;
            let documentLink = `<a id="${fileReference}" class="section"></a>`;
            if (links.indexOf(`#${fileReference}`) < 0) {
                // Add link to document start
                links.push(`#${fileReference}`);
            }
            if (typeof args.htmlFile === "undefined" || ((_d = args.htmlFile) === null || _d === void 0 ? void 0 : _d.length) == 0) {
                this.outputText(documentLink);
                this.outputText(html);
            }
            else {
                content.push(documentLink);
                content.push(html);
            }
            content.push('</div>');
        }
        if (((_e = args.htmlFile) === null || _e === void 0 ? void 0 : _e.length) > 0) {
            content.push(`<script src='prism.js'></script></body></html>`);
            let htmlFile = args.htmlFile;
            if (!path.isAbsolute(args.htmlFile)) {
                htmlFile = path.normalize(path.join(docsPath, htmlFile));
            }
            toc.push("</ul></div>");
            content.splice(1, 0, toc.join(EOL));
            await this.writeFile(htmlFile, content.join(EOL));
        }
        (_f = this.logger) === null || _f === void 0 ? void 0 : _f.info("Checking links");
        for (var i = 0; i < lines.length; i++) {
            let fileid = lines[i].replace(/\//g, '-').replace(".md", '');
            let missing = [];
            for (var l = 0; l < ((_g = fileReferences[fileid]) === null || _g === void 0 ? void 0 : _g.length); l++) {
                if (fileReferences[fileid][l].startsWith("#") && links.indexOf(fileReferences[fileid][l]) < 0) {
                    if (fileReferences[fileid][l].startsWith("#section-"))
                        missing.push(`Unable to page ${fileReferences[fileid][l].replace('#section-', '')}`);
                    else {
                        missing.push(`Unable to find heading ${fileReferences[fileid][l]}`);
                    }
                }
            }
            if (missing.length > 0) {
                (_h = this.logger) === null || _h === void 0 ? void 0 : _h.info(lines[i]);
                for (var l = 0; l < missing.length; l++) {
                    (_j = this.logger) === null || _j === void 0 ? void 0 : _j.error(missing[l]);
                }
            }
        }
        return Promise.resolve();
    }
}
exports.EbookCommand = EbookCommand;
/**
 * Ebook Command Arguments
 */
class EbookArguments {
}
exports.EbookArguments = EbookArguments;
//# sourceMappingURL=ebook.js.map