export default async function() {
    // console.log("Initializing exgternal links as ES module...");
  
    // Load the lightbox module dynamically
    const external_links_module = await import('./external-links.js');
    external_links_module.default(); // Run the lightbox logic
  }