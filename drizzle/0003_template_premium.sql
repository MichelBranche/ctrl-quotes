-- Template premium: one new template row. Additive only; existing rows, quotes and versions are untouched.
-- Names and descriptions shown in the app now come from code (src/domain/templates.ts).
INSERT OR IGNORE INTO `templates` (`id`, `key`, `name`, `description`, `version`, `created_at`) VALUES ('tpl_studio', 'studio', 'Studio Editorial', 'Pulito e architettonico, con etichette maiuscole, box tenui e una grafica di copertina in pietra.', 1, 1794498437290);
