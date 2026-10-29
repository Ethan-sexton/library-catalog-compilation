CREATE TABLE users (
    id              INT          AUTOINCREMENT PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL      UNIQUE,
    email           VARCHAR(100) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);