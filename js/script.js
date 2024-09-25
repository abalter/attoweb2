class ClientSideRouter {
  constructor() {
    this.currentUrl = window.location.pathname;
    this.init();
  }

  // Initialize the client-side router
  async init() {
    this.globalConfig = await this.fetchFile("config.json", "json");
    if (this.globalConfig) {
      const { content_base, template_base, plugins_base } = this.globalConfig;
      this.contentBase = content_base;
      this.templateBase = template_base;
      this.pluginsBase = plugins_base;
    }
    window.addEventListener('load', this.onLoad.bind(this));
    window.addEventListener('popstate', this.onPopState.bind(this));
    document.addEventListener('click', this.handleLinks.bind(this));
  }

  // Load default or specific content based on the current URL
  async onLoad() {
    console.log("onLoad");

    const config = this.globalConfig;
    console.log({ config });

    console.log('Rendering default content');
    await this.renderQuery('default');

    const currentPage = this.getQueryParam('page') || 'home';
    console.log(`Rendering content for page: ${currentPage}`);
    await this.renderQuery(currentPage);
    this.setActiveLink(currentPage);
  }

  // Handle browser back/forward button
  async onPopState() {
    const pathQuery = this.getQueryParam('page') || 'home';
    await this.renderQuery(pathQuery);
    this.setActiveLink(pathQuery);
  }

  // Handle click events on links
  async handleLinks(event) {
    const targetElement = event.target;
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
  }

  // Collapse the menu (if applicable)
  collapseMenu() {
    const dropCheckbox = document.getElementById('drop');
    if (dropCheckbox && dropCheckbox.checked) {
      dropCheckbox.checked = false;
    }
  }

  // Check if a link is external
  isExternalLink(link) {
    return new URL(link.href).host !== window.location.host;
  }

  // Get query parameter
  getQueryParam(param) {
    return new URLSearchParams(window.location.search).get(param);
  }

  // Set active link in the navigation
  setActiveLink(targetPage) {
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
      const hrefQuery = new URLSearchParams(link.getAttribute('href')).get('page');
      link.classList.toggle('active', hrefQuery === targetPage);
    });
  }

  // Fetch a file (text or JSON)
  async fetchFile(filePath, dataType = 'text') {
    try {
      const response = await fetch(filePath);
      if (!response.ok) throw new Error(`Failed to fetch ${filePath}`);
      return dataType === 'json' ? await response.json() : await response.text();
    } catch (error) {
      console.error(`Error fetching file: ${filePath}`, error);
      return null;
    }
  }

  async renderQuery(path) {
    console.log(`renderQuery: ${path}`);

    const contentDir = `${this.contentBase}/${path}`;
    const config = await this.fetchFile(`${contentDir}/config.json`, 'json');
    console.log({ config });

    // First, render page-specific content
    if (config) {
      for (const slotConfig of [config].flat()) {
        console.log({ slotConfig });

        await this.renderSlot(slotConfig, contentDir);
        if (slotConfig.plugins) {
          const plugins = slotConfig.plugins;
          console.log({ plugins });

          await this.loadPlugins(slotConfig.plugins);  // Load page-specific plugins
        }
      }
    }

    // Ensure all default plugins are loaded after page-specific plugins
    if (this.globalConfig && this.globalConfig.default_plugins) {
      const config = this.globalConfig;
      // console.log({ config });
      await this.loadPlugins(config.default_plugins);  // Load default plugins
    }
  }

  // Render a slot (template or content area)
  async renderSlot({ slot, template, data, styles }, dir) {
    console.log("renderSlot");
    data = [data].flat();
    styles = [styles].flat();
    console.log('Styles after flattening:', styles);

    console.log({ slot, template, data, styles, dir });

    if (!slot || !document.querySelector(`${slot}`)) {
      console.error('Slot element missing or config error:', slot);
      return;
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
    console.log({ rendered });

    document.querySelector(`${slot}`).innerHTML = rendered;

    if (styles) {
      this.loadStylesheets(styles);
    }
  }

  async loadStylesheets(styles) {
    for (const style of styles) {
      try {
        console.log("Loading stylesheet:", style);

        // Create a link element for each stylesheet
        const linkElement = document.createElement('link');
        linkElement.rel = 'stylesheet';
        linkElement.href = `css/${style}`;  // Ensure this contains the correct full path

        // Append the link element to the head
        document.head.appendChild(linkElement);

        console.log(`Stylesheet loaded: ${style}`);
      } catch (error) {
        console.error(`Error loading stylesheet: ${style}`, error);
      }
    }
  }

  // Convert markdown to HTML
  async convertMarkdownToHtml(filePath) {
    const markdown = await this.fetchFile(filePath);
    return marked.parse(markdown || '');
  }

  // Load plugins dynamically
  loadCSS(cssPath) {
    return new Promise((resolve, reject) => {
      const fullPath = `${this.pluginsBase}/${cssPath}`;
      console.log({ fullPath });

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = fullPath;

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
      console.log({ path, css, js });
      try {
        if (css) await this.loadCSS(`${path}/${css}`);
        const pluginPath = `${this.pluginsBase}/${path}/plugin.js`;

        const pluginModule = await import(pluginPath);
        if (typeof pluginModule.default === 'function') {
          pluginModule.default();  // Run the logic defined by the developer
        }
      } catch (error) {
        console.error(`Error loading plugin from ${path}`, error);
      }
    }
  }
}

// Initialize the client-side router
const router = new ClientSideRouter();