INSERT INTO users (username, email, password_hash)
VALUES (
  'catalog_test',
  'catalog-test@example.com',
  '$2b$12$k7pV9p.uRlYJoaQNvFphgevxW36JVe3.yHTMLbxca5pReyGuOs4m2'
)
ON CONFLICT (username) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash;