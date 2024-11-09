export default function setExternalLinks() {
    // Check if a link is external
    const isExternalLink = function(link) {
        return new URL(link.href).host !== window.location.host;
    }

    console.log("external links plugin initialized");

    [...document.querySelectorAll('a')]
        .filter(link => isExternalLink(link))
        .forEach(link => link.target = '_blank');
}