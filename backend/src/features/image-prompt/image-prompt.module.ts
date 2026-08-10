import { Module } from '@nestjs/common';
import { ImagePromptController } from './image-prompt.controller.js';
import { ImagePromptService } from './image-prompt.service.js';
import { ImagePromptRepository } from './image-prompt.repository.js';
import { VisualQaService } from './visual-qa.service.js';

@Module({
  controllers: [ImagePromptController],
  providers: [ImagePromptService, ImagePromptRepository, VisualQaService],
  exports: [ImagePromptService, VisualQaService],
})
export class ImagePromptModule {}
