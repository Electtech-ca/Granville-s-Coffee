-- Photos for menu items and categories (the public menu shows one picture per dish).
alter table menu_items add column if not exists photo text;
alter table menu_categories add column if not exists photo text;
