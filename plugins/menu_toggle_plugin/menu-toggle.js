// plugins/menu_toggle_plugin/menu-toggle.js
export default function menuTogglePlugin() {
    console.log('menuTogglePlugin initialized');
    document.addEventListener('click', (event) => {
        const targetElement = event.target;
        if (targetElement.classList.contains('toggle-submenu')) {
            console.log({targetElement});
            event.preventDefault();
            const submenu = targetElement.nextElementSibling;
            if (submenu && submenu.classList.contains('submenu')) {
                submenu.classList.toggle('visible');
            }
        }
    });
}