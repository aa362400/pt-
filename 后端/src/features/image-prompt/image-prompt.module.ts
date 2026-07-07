import { Module } from '@nestjs/common';
import { ImagePromptController } from './image-prompt.controller.js';
import { ImagePromptService } from './image-prompt.service.js';
import { ImagePromptRepository } from './image-prompt.repository.js';

@Module({
  controllers: [ImagePromptController],
  providers: [ImagePromptService, ImagePromptRepository],
  exports: [ImagePromptService],
})
export class ImagePromptModule {}
