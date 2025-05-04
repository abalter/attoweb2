// Import libraries from CDN
import Mustache from 'https://esm.run/mustache';
import { marked } from 'https://esm.run/marked';
import { gfmHeadingId } from 'https://esm.run/marked-gfm-heading-id';
import customHeadingId from 'https://esm.run/marked-custom-heading-id';
import YAML from 'https://esm.run/js-yaml';

// Configure Marked with plugins
const options = { /* custom options */ };
marked.use(gfmHeadingId(options));
marked.use(customHeadingId());
marked.use({
    breaks: true,
    gfm: true,
});

class ClientSideRouter {
    constructor() {
        this.currentUrl = window.location.pathname;
        this.init();
    }

    async init() {
        this.globalConfig = await this.fetchFile("config.json", "json");
        if (this.globalConfig) {
            let { file_root, content_base, template_base, plugins_base } = this.globalConfig;
            if (file_root !== "") {
                file_root = `${file_root}/`;
            }
            this.fileRoot = file_root;
            this.contentBase = `${file_root}${content_base}`;
            this.templateBase = `${file_root}${template_base}`;
            this.pluginsBase = `${file_root}${plugins_base}`;
            console.log(`File root is set to: ${this.fileRoot}`); // Debug log
        } else {
            throw new Error("Failed to fetch globalConfig or globalConfig is null.");
        }

        window.addEventListener('load', this.onLoad.bind(this));
        window.addEventListener('popstate', this.onPopState.bind(this));
        document.addEventListener('click', this.handleLinks.bind(this));

        await this.onLoad();
    }

    async onLoad() {
        console.log("onLoad triggered");
        this.globalConfig = await this.fetchFile("config.json", "json");
        await this.renderQuery('default');
        this.onPopState();
    }

    async onPopState() {
        console.log("onPopState triggered");
        const pathQuery = this.getQueryParam('page') || 'home';
        await this.renderQuery(pathQuery);
        this.setActiveLink(pathQuery);
        this.scrollToLocation();
    }

    scrollToLocation() {
        const { hash } = window.location;
        if (hash) {
            const targetElement = document.querySelector(hash);
            if (targetElement) {
                const topPosition = document.querySelector('nav')?.offsetHeight || 0;
                const offsetPosition = targetElement.getBoundingClientRect().top + window.scrollY - topPosition;
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
            }
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    async handleLinks(event) {
        const targetElement = event.target;
        if (targetElement.nodeName === 'A' && !this.isExternalLink(targetElement)) {
            event.preventDefault();
            const targetPage = new URL(targetElement.href).searchParams.get('page') || 'home';
            if (window.location.search !== `?page=${targetPage}`) {
                await this.renderQuery(targetPage);
                this.setActiveLink(targetPage);
                window.history.pushState(null, '', `?page=${targetPage}`);
                this.scrollToLocation();
                this.collapseMenu();
            }
        }
    }

    collapseMenu() {
        const dropCheckbox = document.getElementById('drop');
        if (dropCheckbox && dropCheckbox.checked) {
            dropCheckbox.checked = false;
        }
    }

    isExternalLink(link) {
        return new URL(link.href).host !== window.location.host;
    }

    setActiveLink(targetPage) {
        const navLinks = document.querySelectorAll('nav a');
        navLinks.forEach(link => {
            const hrefQuery = new URLSearchParams(link.getAttribute('href')).get('page');
            link.classList.toggle('active', hrefQuery === targetPage);
        });
    }

    getQueryParam(param) {
        return new URLSearchParams(window.location.search).get(param);
    }

    async fetchFile(filePath, dataType = 'text') {
        try {
            console.log(`Fetching file: ${filePath}`);
            const response = await fetch(filePath);
            if (!response.ok) throw new Error(`Failed to fetch ${filePath}`);
            return dataType === 'json' ? await response.json() : await response.text();
        } catch (error) {
            console.error(`Error fetching file: ${filePath}`, error);
            return null;
        }
    }

    async renderQuery(path) {
        try {
            console.log(`Rendering query for path: ${path}`);
            const contentDir = `content/${path}`;
            const config = await this.fetchFile(`${contentDir}/config.json`, 'json');
            if (!config) {
                console.error(`No config found for path: ${path}`);
                return;
            }

            const configArray = Array.isArray(config) ? config : [config];
            for (const slotConfig of configArray) {
                console.log(`Processing slotConfig:`, slotConfig);
                await this.renderSlot(slotConfig, contentDir);
                if (slotConfig.styles) {
                    await this.loadStylesheets(slotConfig.styles);
                }
                if (slotConfig.plugins) {
                    await this.loadPlugins(slotConfig.plugins);
                }
            }

            if (this.globalConfig && this.globalConfig.default_plugins) {
                await this.loadPlugins(this.globalConfig.default_plugins);
            }
        } catch (error) {
            console.error("Error rendering query:", error);
        }
    }

    async renderSlot({ slot, template, data }, dir) {
        console.log(`Rendering slot: ${slot}, template: ${template}, data:`, data);
        const slotElement = document.getElementById(slot); // Use getElementById for IDs
        if (!slotElement) {
            console.error('Slot element missing:', slot);
            return;
        }

        const dataElements = Array.isArray(data) ? data : [data];
        const dataPromises = dataElements.map(async dataElement => {
            const sources = Array.isArray(dataElement.sources) ? dataElement.sources : [dataElement.sources].filter(Boolean);

            const sourcesPromises = sources.map(source => {
                if (source && source.source) {
                    return this.fetchMarkdownWithFrontmatter(`${dir}/${source.source}`, source.content_name);
                }
                console.warn("Skipping undefined source:", source);
                return Promise.resolve({});
            });

            const sourcesData = await Promise.all(sourcesPromises);
            return Object.assign(dataElement, ...sourcesData);
        });

        const finalData = await Promise.all(dataPromises);
        const templateHtml = template ? await this.fetchFile(`./templates/${template}`) : '';
        const rendered = Mustache.render(templateHtml, { data: finalData });
        slotElement.innerHTML = rendered;
    }

    async fetchMarkdownWithFrontmatter(sourceUrl, contentName) {
        console.log(`Fetching markdown with frontmatter: ${sourceUrl}`);
        const response = await fetch(sourceUrl);
        const markdown = await response.text();
        const { frontmatter, content } = this.parseFrontmatter(markdown);
        return { ...frontmatter, [contentName]: marked.parse(content) };
    }

    parseFrontmatter(markdown) {
        const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(markdown);
        if (match) {
            const frontmatter = YAML.load(match[1]);
            const content = match[2];
            return { frontmatter, content };
        }
        return { frontmatter: {}, content: markdown };
    }

    async loadPlugins(pluginConfigs) {
        for (const { path, css, js } of pluginConfigs) {
            if (css) await this.loadCSS(`${path}/${css}`);
            const pluginPath = `${window.location.origin}${window.location.pathname}plugins/${path}/plugin.js`;
            const pluginModule = await import(pluginPath);
            if (typeof pluginModule.default === 'function') pluginModule.default();
        }
    }

    async loadStylesheets(styles) {
        styles = Array.isArray(styles) ? styles : [styles];
        styles.forEach(style => {
            const cssPath = this.fileRoot ? `${this.fileRoot}css/${style}` : `css/${style}`;
            console.log(`Loading stylesheet: ${cssPath}`); // Debug log
            const linkElement = document.createElement('link');
            linkElement.rel = 'stylesheet';
            linkElement.href = cssPath;
            linkElement.type = 'text/css';
            document.head.appendChild(linkElement);
        });
    }

    loadCSS(cssPath) {
        return new Promise((resolve, reject) => {
            const fullPath = `${window.location.origin}${window.location.pathname}plugins/${cssPath}`;
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = fullPath;
            link.onload = () => resolve();
            link.onerror = () => reject();
            document.head.appendChild(link);
        });
    }
}

const router = new ClientSideRouter();