ALTER TABLE `users` ADD COLUMN `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL AFTER `email`;