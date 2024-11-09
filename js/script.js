class ClientSideRouter {
  constructor() {
    console.log("ClientSideRouter constructor");
    this.currentUrl = window.location.pathname;

    if (typeof Mustache === 'undefined') {
      console.error('Mustache is not defined');
      return;
    } else {
      console.log('Mustache is defined:', Mustache);
    }

    this.init();
  }

  async init() {
    try {
      console.log("ClientSideRouter init");
      this.globalConfig = await this.fetchFile("config.json", "json");
      console.log("Fetched globalConfig:", this.globalConfig);

      if (this.globalConfig) {
        let { file_root, content_base, template_base, plugins_base } = this.globalConfig;

        // Add trailing slash to file_root if it's not an empty string
        if (file_root !== "") {
          file_root = `${file_root}/`;
        }

        this.fileRoot = file_root;
        this.contentBase = `${file_root}${content_base}`;
        this.templateBase = `${file_root}${template_base}`;
        this.pluginsBase = `${file_root}${plugins_base}`;

        console.log("Config values set:", { file_root, content_base, template_base, plugins_base });
      } else {
        throw new Error("Failed to fetch globalConfig or globalConfig is null.");
      }

      window.addEventListener('load', this.onLoad.bind(this));
      console.log("Added load event listener");

      window.addEventListener('popstate', this.onPopState.bind(this));
      console.log("Added popstate event listener");

      document.addEventListener('click', this.handleLinks.bind(this));
      console.log("Added click event listener");

      await this.onLoad();
    } catch (error) {
      console.error("Error during initialization:", error);
    }
  }

  async onLoad() {
    try {
      console.log("onLoad");

      const config = this.globalConfig;
      console.log({ config });

      console.log('Rendering default content');
      await this.renderQuery('default');

      const currentPage = this.getQueryParam('page') || 'home';
      console.log(`Rendering content for page: ${currentPage}`);
      await this.renderQuery(currentPage);
      this.setActiveLink(currentPage);
      this.scrollToLocation();
    } catch (error) {
      console.error("Error during onLoad:", error);
    }
  }

  async onPopState() {
    try {
      console.log("onPopState");
      const pathQuery = this.getQueryParam('page') || 'home';
      await this.renderQuery(pathQuery);
      this.setActiveLink(pathQuery);
    } catch (error) {
      console.error("Error during onPopState:", error);
    }
  }

  async handleLinks(event) {
    try {
      const targetElement = event.target;
      console.log("Event target:", targetElement);
      if (targetElement.nodeName === 'A' && !this.isExternalLink(targetElement)) {
        event.preventDefault();

        const targetPage = new URL(targetElement.href).searchParams.get('page') || 'home';
        if (window.location.search !== `?page=${targetPage}`) {
          await this.renderQuery(targetPage);
          this.setActiveLink(targetPage);
          window.history.pushState(null, '', `?page=${targetPage}`);
          this.collapseMenu();
        }
      }
    } catch (error) {
      console.error("Error during handleLinks:", error);
    }
  }

  collapseMenu() {
    try {
      console.log("collapseMenu");
      const dropCheckbox = document.getElementById('drop');
      if (dropCheckbox && dropCheckbox.checked) {
        dropCheckbox.checked = false;
      }
    } catch (error) {
      console.error("Error during collapseMenu:", error);
    }
  }

  isExternalLink(link) {
    try {
      console.log("isExternalLink:", link.href);
      return new URL(link.href).host !== window.location.host;
    } catch (error) {
      console.error("Error during isExternalLink:", error);
      return false;
    }
  }

  getQueryParam(param) {
    try {
      console.log("getQueryParam for:", param);
      return new URLSearchParams(window.location.search).get(param);
    } catch (error) {
      console.error("Error during getQueryParam:", error);
      return null;
    }
  }

  setActiveLink(targetPage) {
    try {
      console.log("setActiveLink for:", targetPage);
      const navLinks = document.querySelectorAll('nav a');
      navLinks.forEach(link => {
        const hrefQuery = new URLSearchParams(link.getAttribute('href')).get('page');
        link.classList.toggle('active', hrefQuery === targetPage);
      });
    } catch (error) {
      console.error("Error during setActiveLink:", error);
    }
  }

  async fetchFile(filePath, dataType = 'text') {
    console.log(`fetchFile: ${filePath}`);
    try {
      const response = await fetch(filePath);
      if (!response.ok) throw new Error(`Failed to fetch ${filePath}`);
      const result = dataType === 'json' ? await response.json() : await response.text();
      console.log(`fetchFile result:`, result);
      return result;
    } catch (error) {
      console.error(`Error fetching file: ${filePath}`, error);
      return null;
    }
  }

  async renderQuery(path) {
    try {
      console.log(`renderQuery: ${path}`);

      const contentDir = `${this.contentBase}/${path}`;
      const config = await this.fetchFile(`${contentDir}/config.json`, 'json');
      console.log("Fetched config for renderQuery:", config);

      if (config) {
        for (const slotConfig of [config].flat()) {
          console.log("Slot config:", slotConfig);
          await this.renderSlot(slotConfig, contentDir);
          if (slotConfig.plugins) {
            const plugins = slotConfig.plugins;
            console.log("Page-specific plugins:", plugins);
            await this.loadPlugins(slotConfig.plugins); // Load page-specific plugins
          }
        }
      }

      if (this.globalConfig && this.globalConfig.default_plugins) {
        const config = this.globalConfig;
        console.log("Default plugins to load:", config.default_plugins);
        await this.loadPlugins(config.default_plugins); // Load default plugins
      }
    } catch (error) {
      console.error("Error during renderQuery:", error);
    }
  }

  async renderSlot({ slot, template, data, styles }, dir) {
    try {
      console.log("renderSlot");
      data = [data].flat();
      styles = [styles].flat();
      console.log('Styles after flattening:', styles);

      console.log({ slot, template, data, styles, dir });

      if (!slot || !document.querySelector(`${slot}`)) {
        throw new Error(`Slot element missing or config error: ${slot}`);
      }

      const promises = data.map(async item => {
        if (item.source_data) {
          await Promise.all(item.source_data.map(async source => {
            item[source.content_name] = await this.convertMarkdownToHtml(`${dir}/${source.source}`);
          }));
        }
      });

      await Promise.all(promises);

      const templateHtml = template ? await this.fetchFile(`${this.templateBase}/${template}`) : '';
      const rendered = Mustache.render(templateHtml, { data });
      console.log("Rendered HTML:", rendered);

      document.querySelector(`${slot}`).innerHTML = rendered;

      if (styles) {
        this.loadStylesheets(styles);
      }
    } catch (error) {
      console.error("Error during renderSlot:", error);
    }
  }

  async loadStylesheets(styles) {
    try {
      for (const style of styles) {
        console.log(`Loading stylesheet: ${style}`);

        const linkElement = document.createElement('link');
        linkElement.rel = 'stylesheet';
        linkElement.href = `${this.fileRoot}css/${style}`;
        linkElement.type = 'text/css';

        document.head.appendChild(linkElement);
        console.log(`Stylesheet loaded: ${style}`);
      }
    } catch (error) {
      console.error(`Error loading stylesheet: ${style}`, error);
    }
  }

  async convertMarkdownToHtml(filePath) {
    try {
      const markdown = await this.fetchFile(filePath);
      const html = marked.parse(markdown || '');
      console.log("Converted markdown to HTML:", html);
      return html;
    } catch (error) {
      console.error("Error during convertMarkdownToHtml:", error);
      return '';
    }
  }

  loadCSS(cssPath) {
    return new Promise((resolve, reject) => {
      const fullPath = `${this.pluginsBase}/${cssPath}`;
      console.log(`Loading CSS from: ${fullPath}`);

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = fullPath;
      link.type = 'text/css';

      link.onload = () => {
        console.log(`${fullPath} loaded successfully.`);
        resolve();
      };
      link.onerror = () => {
        console.error(`Failed to load stylesheet ${fullPath}`);
        reject();
      };

      document.head.appendChild(link);
    });
  }

  async loadPlugins(pluginConfigs) {
    for (const { path, css, js } of pluginConfigs) {
      console.log("Loading plugin:", { path, css, js });
      try {
        if (css) await this.loadCSS(`${path}/${css}`);
        if (js) await this.loadJS(`${path}/${js}`);
      } catch (error) {
        console.error(`Error loading plugin from ${path}`, error);
      }
    }
  }

  loadJS(jsPath) {
    return new Promise((resolve, reject) => {
      const fullPath = `${this.pluginsBase}/${jsPath}`;
      console.log(`Loading JS from: ${fullPath}`);

      const script = document.createElement('script');
      script.src = fullPath;
      script.type = 'module';

      script.onload = () => {
        console.log(`${fullPath} loaded successfully.`);
        resolve();
      };
      script.onerror = () => {
        console.error(`Failed to load script ${fullPath}`);
        reject();
      };

      document.body.appendChild(script);
    });
  }
}

// Initialize the client-side router
const router = new ClientSideRouter();
console.log('ClientSideRouter initialized');