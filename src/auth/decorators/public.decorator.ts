import { SetMetadata } from '@nestjs/common';
import { MetadataKey } from '../constants/auth.enums';

export const Public = () => SetMetadata(MetadataKey.IS_PUBLIC, true);
