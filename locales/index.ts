import i18n from 'i18n';
import path from 'path';
export const langs = {
    ar: 'العربية 🇱🇧',
    en: 'English 🇬🇧',
    // it: 'Italiana 🇮🇹',
    // fr: 'Français 🇫🇷',
    // de: 'Deutsch 🇩🇪',    
    // es: 'Española 🇪🇸',
    // fa:'فارسی 🇮🇷'
    // tr: 'Türk 🇹🇷',
    // ru: 'русский 🇷🇺'
};

i18n.configure({
    directory: path.join(__dirname, '/'),
    autoReload: true,
    retryInDefaultLocale: true,
    locales: Object.keys(langs),
    defaultLocale: 'en'
})

export default i18n;
