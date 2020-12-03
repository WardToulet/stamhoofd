ALTER TABLE `cities` ADD FOREIGN KEY (`provinceId`) REFERENCES `provinces` (`id`) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `cities` ADD FOREIGN KEY (`parentCityId`) REFERENCES `cities` (`id`) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `postal_codes` ADD FOREIGN KEY (`cityId`) REFERENCES `cities` (`id`) ON UPDATE CASCADE ON DELETE CASCADE;