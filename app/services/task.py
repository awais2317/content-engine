import math
import os.path
import re
from os import path
import json
import re as _re
from datetime import datetime

from loguru import logger

from app.config import config
from app.models import const
from app.models.schema import VideoConcatMode, VideoParams
from app.services import llm, material, subtitle, video, voice, upload_post
from app.services import s3_storage
from app.services import channel_store as _channel_store
from app.services import state as sm
from app.utils import file_security, utils


def generate_script(task_id, params):
    logger.info("\n\n## generating video script")
    video_script = params.video_script.strip()
    if not video_script:
        video_script = llm.generate_script(
            video_subject=params.video_subject,
            language=params.video_language,
            target_duration=params.target_duration,
            video_script_prompt=params.video_script_prompt,
            custom_system_prompt=params.custom_system_prompt,
            provider_override=params.llm_provider_override or "",
            model_override=params.llm_model_override or "",
        )
    else:
        logger.debug(f"video script: \n{video_script}")

    if not video_script:
        sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
        logger.error("failed to generate video script.")
        return None

    return video_script


def generate_terms(task_id, params, video_script):
    logger.info("\n\n## generating video terms")
    video_terms = params.video_terms
    if not video_terms:
        # 开启素材按文案顺序匹配后，关键词本身也必须按脚本叙事顺序生成；
        # 否则后续即使顺序下载和顺序拼接，也只能复用一组全局主题词，
        # 无法改善“后面内容的画面提前出现”的问题。
        video_terms = llm.generate_terms(
            video_subject=params.video_subject,
            video_script=video_script,
            amount=8 if params.match_materials_to_script else 5,
            match_script_order=params.match_materials_to_script,
            provider_override=params.llm_provider_override or "",
            model_override=params.llm_model_override or "",
        )
    else:
        if isinstance(video_terms, str):
            video_terms = [term.strip() for term in re.split(r"[,，]", video_terms)]
        elif isinstance(video_terms, list):
            video_terms = [term.strip() for term in video_terms]
        else:
            raise ValueError("video_terms must be a string or a list of strings.")

        logger.debug(f"video terms: {utils.to_json(video_terms)}")

    if not video_terms:
        sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
        logger.error("failed to generate video terms.")
        return None

    return video_terms


def save_script_data(task_id, video_script, video_terms, params):
    script_file = path.join(utils.task_dir(task_id), "script.json")
    script_data = {
        "script": video_script,
        "search_terms": video_terms,
        "params": params,
    }

    with open(script_file, "w", encoding="utf-8") as f:
        f.write(utils.to_json(script_data))


def resolve_custom_audio_file(task_id: str, custom_audio_file: str | None) -> str:
    requested_file = (custom_audio_file or "").strip()
    if not requested_file:
        return ""

    task_dir = utils.task_dir(task_id)
    try:
        return file_security.resolve_path_within_directory(
            task_dir,
            requested_file,
        )
    except ValueError as exc:
        task_dir_error = exc

    server_audio_file = path.realpath(
        requested_file
        if path.isabs(requested_file)
        else path.join(utils.root_dir(), requested_file)
    )
    if not path.isabs(requested_file):
        project_root = path.realpath(utils.root_dir())
        try:
            if path.commonpath([project_root, server_audio_file]) != project_root:
                raise ValueError(
                    "relative custom audio paths must stay within the project directory"
                )
        except ValueError as exc:
            raise ValueError(
                "custom audio file must be task-local or an existing server-side file"
            ) from exc

    if not path.isfile(server_audio_file):
        raise ValueError(
            "custom audio file does not exist or is not a file"
        ) from task_dir_error

    return server_audio_file


def generate_audio(task_id, params, video_script):
    '''
    Generate audio for the video script.
    If a custom audio file is provided, it will be used directly.
    There will be no subtitle maker object returned in this case.
    Otherwise, TTS will be used to generate the audio.
    Returns:
        - audio_file: path to the generated or provided audio file
        - audio_duration: duration of the audio in seconds
        - sub_maker: subtitle maker object if TTS is used, None otherwise
    '''
    logger.info("\n\n## generating audio")
    # /audio 和 /subtitle 请求模型不包含 custom_audio_file，
    # 这里统一做兼容读取，避免直调接口时抛属性错误。
    requested_custom_audio_file = getattr(params, "custom_audio_file", None)
    try:
        custom_audio_file = resolve_custom_audio_file(
            task_id, requested_custom_audio_file
        )
    except ValueError as exc:
        logger.error(
            "custom audio file is invalid, "
            f"task_id: {task_id}, path: {requested_custom_audio_file}, error: {str(exc)}"
        )
        sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
        return None, None, None

    if not custom_audio_file:
        logger.info("no custom audio file provided, using TTS to generate audio.")
        audio_file = path.join(utils.task_dir(task_id), "audio.mp3")
        sub_maker = voice.tts(
            text=video_script,
            voice_name=voice.parse_voice_name(params.voice_name),
            voice_rate=params.voice_rate,
            voice_file=audio_file,
        )
        if sub_maker is None:
            sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
            logger.error(
                """failed to generate audio:
1. check if the language of the voice matches the language of the video script.
2. check if the network is available. If you are in China, it is recommended to use a VPN and enable the global traffic mode.
            """.strip()
            )
            return None, None, None
        audio_duration = math.ceil(voice.get_audio_duration(sub_maker))
        if audio_duration == 0:
            sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
            logger.error("failed to get audio duration.")
            return None, None, None
        return audio_file, audio_duration, sub_maker
    else:
        logger.info(f"using custom audio file: {custom_audio_file}")
        audio_duration = voice.get_audio_duration(custom_audio_file)
        if audio_duration == 0:
            sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
            logger.error("failed to get audio duration from custom audio file.")
            return None, None, None
        return custom_audio_file, audio_duration, None

def generate_subtitle(task_id, params, video_script, sub_maker, audio_file):
    '''
    Generate subtitle for the video script.
    If subtitle generation is disabled or no subtitle maker is provided, it will return an empty string.
    Otherwise, it will generate the subtitle using the specified provider.
    Returns:
        - subtitle_path: path to the generated subtitle file
    '''
    logger.info("\n\n## generating subtitle")
    if not params.subtitle_enabled or sub_maker is None:
        return ""

    subtitle_path = path.join(utils.task_dir(task_id), "subtitle.srt")
    subtitle_provider = config.app.get("subtitle_provider", "edge").strip().lower()
    logger.info(f"\n\n## generating subtitle, provider: {subtitle_provider}")

    subtitle_fallback = False
    if subtitle_provider == "edge":
        voice.create_subtitle(
            text=video_script, sub_maker=sub_maker, subtitle_file=subtitle_path
        )
        if not os.path.exists(subtitle_path):
            subtitle_fallback = True
            logger.warning("subtitle file not found, fallback to whisper")

    if subtitle_provider == "whisper" or subtitle_fallback:
        subtitle.create(audio_file=audio_file, subtitle_file=subtitle_path)
        logger.info("\n\n## correcting subtitle")
        subtitle.correct(subtitle_file=subtitle_path, video_script=video_script)

    subtitle_lines = subtitle.file_to_subtitles(subtitle_path)
    if not subtitle_lines:
        logger.warning(f"subtitle file is invalid: {subtitle_path}")
        return ""

    return subtitle_path


def get_video_materials(task_id, params, video_terms, audio_duration):
    if params.video_source == "local":
        logger.info("\n\n## preprocess local materials")
        materials = video.preprocess_video(
            materials=params.video_materials, clip_duration=params.video_clip_duration
        )
        if not materials:
            sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
            logger.error(
                "no valid materials found, please check the materials and try again."
            )
            return None
        return [material_info.url for material_info in materials]
    else:
        logger.info(f"\n\n## downloading videos from {params.video_source}")
        # 顺序匹配模式只在用户显式开启时生效。这里强制素材下载按关键词顺序
        # 轮询，避免某个早期关键词下载太多素材，把后续脚本主题挤出最终时间线。
        downloaded_videos = material.download_videos(
            task_id=task_id,
            search_terms=video_terms,
            source=params.video_source,
            video_aspect=params.video_aspect,
            video_concat_mode=(
                VideoConcatMode.sequential
                if params.match_materials_to_script
                else params.video_concat_mode
            ),
            audio_duration=audio_duration * params.video_count,
            max_clip_duration=params.video_clip_duration,
            match_script_order=params.match_materials_to_script,
            replicate_model=params.replicate_model or "",
        )
        if not downloaded_videos:
            sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
            logger.error(
                "failed to download videos, maybe the network is not available. if you are in China, please use a VPN."
            )
            return None
        return downloaded_videos


def generate_avatar_video(task_id, params):
    """
    Generate an avatar intro video if enabled.
    
    Returns:
        Path to avatar video, or None if not enabled or failed
    """
    if not params.avatar_enabled or params.avatar_provider != "heygen":
        return None
    
    try:
        from app.services import avatar_generator
        
        generator = avatar_generator.get_avatar_generator()
        
        if not generator.is_enabled():
            logger.warning("Avatar generation enabled but HeyGen not configured")
            return None
        
        # Use custom intro script or generate default
        avatar_script = params.avatar_intro_script or f"Hi! Today I'm excited to share: {params.video_subject}"
        
        logger.info(f"Generating avatar video for task {task_id}")
        avatar_path = generator.generate_avatar_video(
            script_text=avatar_script,
            avatar_id=params.avatar_id,
            voice_id=params.avatar_voice_id,
            task_id=task_id,
        )
        
        if avatar_path:
            logger.success(f"Avatar video generated: {avatar_path}")
            return avatar_path
        else:
            logger.warning("Failed to generate avatar video, continuing without it")
            return None
            
    except Exception as e:
        logger.error(f"Error generating avatar video: {e}")
        return None


def prepend_avatar_to_video(avatar_path, video_path, output_path):
    """
    Prepend avatar video to main video.
    
    Args:
        avatar_path: Path to avatar video
        video_path: Path to main video
        output_path: Path to save combined video
        
    Returns:
        True if successful, False otherwise
    """
    try:
        import os as _os
        from moviepy.editor import concatenate_videoclips, VideoFileClip
        
        logger.info(f"Combining avatar video with main video")
        
        # Load clips
        avatar_clip = VideoFileClip(avatar_path)
        main_clip = VideoFileClip(video_path)
        
        # Combine
        combined = concatenate_videoclips([avatar_clip, main_clip])
        
        # Write output
        combined.write_videofile(
            output_path,
            codec="libx264",
            audio_codec="aac",
            verbose=False,
            logger=None,
        )
        
        # Clean up
        avatar_clip.close()
        main_clip.close()
        combined.close()
        
        logger.success(f"Combined video saved: {output_path}")
        return True
        
    except Exception as e:
        logger.error(f"Error combining videos: {e}")
        return False


def generate_final_videos(
    task_id, params, downloaded_videos, audio_file, subtitle_path
):
    final_video_paths = []
    combined_video_paths = []
    s3_keys = []
    s3_metadata = []
    avatar_path = generate_avatar_video(task_id, params)
    # 多视频生成默认会打散素材以增加差异；但“按文案顺序匹配素材”追求的是
    # 时间线稳定性和可解释性，所以开启后所有输出都使用顺序拼接。
    if params.match_materials_to_script:
        video_concat_mode = VideoConcatMode.sequential
    elif params.video_count == 1:
        video_concat_mode = params.video_concat_mode
    else:
        video_concat_mode = VideoConcatMode.random
    video_transition_mode = params.video_transition_mode

    _progress = 50
    for i in range(params.video_count):
        index = i + 1
        combined_video_path = path.join(
            utils.task_dir(task_id), f"combined-{index}.mp4"
        )
        logger.info(f"\n\n## combining video: {index} => {combined_video_path}")
        video.combine_videos(
            combined_video_path=combined_video_path,
            video_paths=downloaded_videos,
            audio_file=audio_file,
            video_aspect=params.video_aspect,
            video_concat_mode=video_concat_mode,
            video_transition_mode=video_transition_mode,
            max_clip_duration=params.video_clip_duration,
            threads=params.n_threads,
        )

        _progress += 50 / params.video_count / 2
        sm.state.update_task(task_id, progress=_progress)

        final_video_path = path.join(utils.task_dir(task_id), f"final-{index}.mp4")

        logger.info(f"\n\n## generating video: {index} => {final_video_path}")
        video.generate_video(
            video_path=combined_video_path,
            audio_path=audio_file,
            subtitle_path=subtitle_path,
            output_file=final_video_path,
            params=params,
        )

        if avatar_path:
            avatar_final_path = path.join(utils.task_dir(task_id), f"final-{index}-with-avatar.mp4")
            if prepend_avatar_to_video(avatar_path, final_video_path, avatar_final_path):
                final_video_path = avatar_final_path

        _progress += 50 / params.video_count / 2
        sm.state.update_task(task_id, progress=_progress)

        # Upload to S3 with structured naming: ChannelName/YYYYMMDD/ID####-Title/
        s3_storage_service = s3_storage.get_s3_storage()
        uploaded_s3_key = None
        if s3_storage_service.enabled:
            ch_slug = _re.sub(r'[^\w\s-]', '', (params.channel_name or 'Uncategorized')).strip()
            ch_slug = (_re.sub(r'\s+', '_', ch_slug)[:50] or 'Uncategorized')
            date_str = datetime.utcnow().strftime('%Y%m%d')
            content_id = _channel_store.next_content_id()
            t_slug = _re.sub(r'[^\w\s-]', '', (params.video_subject or 'video')).strip()
            t_slug = _re.sub(r'\s+', '-', t_slug)[:60]
            folder = f'{ch_slug}/{date_str}/ID{content_id:04d}-{t_slug}'
            s3_key = f'{folder}/final-{index}.mp4'
            uploaded_s3_key = s3_storage_service.upload_file(final_video_path, s3_key)
            if uploaded_s3_key:
                logger.info(f"Uploaded to S3: {s3_key}")
                meta = {
                    "content_id": f'{ch_slug}/{date_str}/ID{content_id:04d}',
                    "title": params.video_subject or "",
                    "channel": params.channel_name or "",
                    "date": date_str,
                    "s3_key": s3_key,
                    "avatar_provider": params.avatar_provider if params.avatar_enabled else "",
                }
                s3_storage_service.upload_json(meta, f'{folder}/metadata.json')
                s3_metadata.append(meta)
            else:
                logger.warning(f"S3 upload failed, keeping local: {final_video_path}")
        final_video_paths.append(final_video_path)
        s3_keys.append(uploaded_s3_key)
        combined_video_paths.append(combined_video_path)

    return final_video_paths, combined_video_paths, s3_keys, s3_metadata


def start(task_id, params: VideoParams, stop_at: str = "video"):
    logger.info(f"start task: {task_id}, stop_at: {stop_at}")
    sm.state.update_task(task_id, state=const.TASK_STATE_PROCESSING, progress=5)

    # Check if product research is enabled
    if params.product_research_enabled:
        logger.info(f"Product research enabled for task {task_id}, using product content generator")
        try:
            from app.services import product_content_generator
            
            # Build channel config from params
            channel_config = {
                "name": params.channel_name,
                "video_aspect": params.video_aspect,
                "voice_name": params.voice_name,
                "bgm_type": params.bgm_type,
                "llm_provider_override": params.llm_provider_override,
                "llm_model_override": params.llm_model_override,
                "product_research_llm_provider": params.product_research_llm_provider,
                "product_research_llm_model": params.product_research_llm_model,
                "subtitle_enabled": params.subtitle_enabled,
            }
            
            result = product_content_generator.generate_product_review_video(
                channel_config=channel_config,
                query=params.video_subject,
                video_type=params.video_type or "comparison",
                video_length=60,
            )
            
            if result.get("status") == "success":
                sm.state.update_task(
                    task_id,
                    state=const.TASK_STATE_COMPLETE,
                    progress=100,
                    product_pipeline=result.get("pipeline_steps"),
                    video_path=result.get("video_path"),
                )
                return result
            else:
                logger.warning(f"Product content generation failed: {result.get('message')}")
                # Fall back to regular script-based generation
                
        except Exception as e:
            logger.warning(f"Product research failed, falling back to script generation: {e}")
    
    # 1. Generate script (regular or fallback)
    video_script = generate_script(task_id, params)
    if not video_script or "Error: " in video_script:
        sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
        return

    sm.state.update_task(task_id, state=const.TASK_STATE_PROCESSING, progress=10)

    if stop_at == "script":
        sm.state.update_task(
            task_id, state=const.TASK_STATE_COMPLETE, progress=100, script=video_script
        )
        return {"script": video_script}

    # 2. Generate terms
    video_terms = ""
    if params.video_source != "local":
        video_terms = generate_terms(task_id, params, video_script)
        if not video_terms:
            sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
            return

    save_script_data(task_id, video_script, video_terms, params)

    if stop_at == "terms":
        sm.state.update_task(
            task_id, state=const.TASK_STATE_COMPLETE, progress=100, terms=video_terms
        )
        return {"script": video_script, "terms": video_terms}

    sm.state.update_task(task_id, state=const.TASK_STATE_PROCESSING, progress=20)

    # 3. Generate audio
    audio_file, audio_duration, sub_maker = generate_audio(
        task_id, params, video_script
    )
    if not audio_file:
        sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
        return

    sm.state.update_task(task_id, state=const.TASK_STATE_PROCESSING, progress=30)

    if stop_at == "audio":
        sm.state.update_task(
            task_id,
            state=const.TASK_STATE_COMPLETE,
            progress=100,
            audio_file=audio_file,
        )
        return {"audio_file": audio_file, "audio_duration": audio_duration}

    # 4. Generate subtitle
    subtitle_path = generate_subtitle(
        task_id, params, video_script, sub_maker, audio_file
    )

    if stop_at == "subtitle":
        sm.state.update_task(
            task_id,
            state=const.TASK_STATE_COMPLETE,
            progress=100,
            subtitle_path=subtitle_path,
        )
        return {"subtitle_path": subtitle_path}

    sm.state.update_task(task_id, state=const.TASK_STATE_PROCESSING, progress=40)

    # 5. Get video materials
    downloaded_videos = get_video_materials(
        task_id, params, video_terms, audio_duration
    )
    if not downloaded_videos:
        sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
        return

    if stop_at == "materials":
        sm.state.update_task(
            task_id,
            state=const.TASK_STATE_COMPLETE,
            progress=100,
            materials=downloaded_videos,
        )
        return {"materials": downloaded_videos}

    sm.state.update_task(task_id, state=const.TASK_STATE_PROCESSING, progress=50)

    # 仅完整视频生成流程才需要处理视频拼接模式；
    # 这样可以避免 /subtitle 和 /audio 这类请求访问不存在的字段。
    if type(params.video_concat_mode) is str:
        params.video_concat_mode = VideoConcatMode(params.video_concat_mode)

    # 6. Generate final videos
    final_video_paths, combined_video_paths, s3_keys, s3_metadata = generate_final_videos(
        task_id, params, downloaded_videos, audio_file, subtitle_path
    )

    if not final_video_paths:
        sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
        return

    logger.success(
        f"task {task_id} finished, generated {len(final_video_paths)} videos."
    )

    youtube_results = []
    if params.youtube_enabled:
        try:
            from app.services import youtube_uploader

            tags = params.youtube_tags or (video_terms if isinstance(video_terms, list) else [])
            title = params.youtube_title or params.video_subject or "Boston's Studio video"
            description = params.youtube_description or video_script[:4500]
            for video_path in final_video_paths:
                video_id = youtube_uploader.upload_video(
                    video_path=video_path,
                    title=title,
                    description=description,
                    tags=tags,
                    thumbnail_path=params.youtube_thumbnail_path or None,
                )
                youtube_results.append(
                    {
                        "video_path": video_path,
                        "video_id": video_id,
                        "url": f"https://www.youtube.com/watch?v={video_id}" if video_id else "",
                        "success": bool(video_id),
                    }
                )
        except Exception as ex:
            logger.warning(f"YouTube upload failed: {ex}")

    # 7. Cross-post to social platforms (if enabled)
    cross_post_results = []
    if upload_post.upload_post_service.is_configured() and upload_post.upload_post_service.auto_upload:
        platforms = upload_post.upload_post_service.platforms
        logger.info(f"\n\n## cross-posting videos to {', '.join(platforms)}")

        youtube_extra = None
        if "youtube" in platforms:
            metadata = llm.generate_social_metadata(
                video_subject=params.video_subject,
                video_script=video_script,
                language=params.video_language or "",
                platform="youtube_shorts",
            )
            youtube_extra = {
                "youtube_title": metadata.get("title", params.video_subject),
                "youtube_description": metadata.get("caption", ""),
                "tags": metadata.get("hashtags", []),
                "privacyStatus": upload_post.upload_post_service.youtube_privacy_status,
                "containsSyntheticMedia": True,
            }

        for video_path in final_video_paths:
            result = upload_post.cross_post_video(
                video_path=video_path,
                title=params.video_subject or "Check out this video! #shorts #viral",
                youtube_extra=youtube_extra,
            )
            cross_post_results.append(result)
            if result.get('success'):
                logger.info(f"✅ Cross-posted: {video_path}")
            else:
                logger.warning(f"⚠️ Failed to cross-post: {video_path} - {result.get('error', 'Unknown error')}")

    # Save S3 keys and clean up local files
    uploaded_keys = [k for k in s3_keys if k]
    if uploaded_keys:
        videos_metadata = {"s3_keys": uploaded_keys, "items": s3_metadata, "youtube_results": youtube_results}
        videos_metadata_file = path.join(utils.task_dir(task_id), "videos.json")
        with open(videos_metadata_file, 'w', encoding='utf-8') as f:
            json.dump(videos_metadata, f, indent=2)
        logger.info(f"Saved S3 keys metadata: {videos_metadata_file}")
        import os as _os
        for lp, sk in zip(final_video_paths, s3_keys):
            if sk and path.exists(lp):
                try:
                    _os.remove(lp)
                    logger.info(f"Deleted local file after S3 upload: {lp}")
                except Exception as ex:
                    logger.warning(f"Could not delete local file {lp}: {ex}")
    
    kwargs = {
        "videos": final_video_paths,
        "combined_videos": combined_video_paths,
        "script": video_script,
        "terms": video_terms,
        "audio_file": audio_file,
        "audio_duration": audio_duration,
        "subtitle_path": subtitle_path,
        "materials": downloaded_videos,
        "s3_keys": uploaded_keys,
        "youtube_results": youtube_results if youtube_results else None,
        "cross_post_results": cross_post_results if cross_post_results else None,
    }
    sm.state.update_task(
        task_id, state=const.TASK_STATE_COMPLETE, progress=100, **kwargs
    )
    return kwargs


if __name__ == "__main__":
    task_id = "task_id"
    params = VideoParams(
        video_subject="金钱的作用",
        voice_name="zh-CN-XiaoyiNeural-Female",
        voice_rate=1.0,
    )
    start(task_id, params, stop_at="video")
