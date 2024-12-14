export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      aggregated_metrics: {
        Row: {
          aggregation_period: string
          avg_value: number
          count: number
          created_at: string | null
          id: string
          job_id: string
          max_value: number
          metric_name: string
          metric_type: Database["public"]["Enums"]["metric_type"]
          min_value: number
          period_end: string
          period_start: string
        }
        Insert: {
          aggregation_period: string
          avg_value: number
          count: number
          created_at?: string | null
          id?: string
          job_id: string
          max_value: number
          metric_name: string
          metric_type: Database["public"]["Enums"]["metric_type"]
          min_value: number
          period_end: string
          period_start: string
        }
        Update: {
          aggregation_period?: string
          avg_value?: number
          count?: number
          created_at?: string | null
          id?: string
          job_id?: string
          max_value?: number
          metric_name?: string
          metric_type?: Database["public"]["Enums"]["metric_type"]
          min_value?: number
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_id"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      categorization_logs: {
        Row: {
          categories: Json | null
          chunk_index: number | null
          confidence: number | null
          crawl_job_id: string | null
          event_type: Database["public"]["Enums"]["categorization_event"]
          id: number
          message: string
          metadata: Json | null
          timestamp: string
          url: string | null
        }
        Insert: {
          categories?: Json | null
          chunk_index?: number | null
          confidence?: number | null
          crawl_job_id?: string | null
          event_type: Database["public"]["Enums"]["categorization_event"]
          id?: never
          message: string
          metadata?: Json | null
          timestamp?: string
          url?: string | null
        }
        Update: {
          categories?: Json | null
          chunk_index?: number | null
          confidence?: number | null
          crawl_job_id?: string | null
          event_type?: Database["public"]["Enums"]["categorization_event"]
          id?: never
          message?: string
          metadata?: Json | null
          timestamp?: string
          url?: string | null
        }
        Relationships: []
      }
      content_blocks: {
        Row: {
          block_type: string | null
          complexity_score: number | null
          content: string
          crawl_job_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          page_id: string | null
          processing_status:
            | Database["public"]["Enums"]["processing_state"]
            | null
          total_tokens: number | null
        }
        Insert: {
          block_type?: string | null
          complexity_score?: number | null
          content: string
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          page_id?: string | null
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          total_tokens?: number | null
        }
        Update: {
          block_type?: string | null
          complexity_score?: number | null
          content?: string
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          page_id?: string | null
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_blocks_crawl_job_id_fkey"
            columns: ["crawl_job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_blocks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "crawled_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      content_embeddings: {
        Row: {
          block_id: string | null
          crawl_job_id: string | null
          created_at: string | null
          embedding: string | null
          id: string
          processing_status:
            | Database["public"]["Enums"]["processing_state"]
            | null
        }
        Insert: {
          block_id?: string | null
          crawl_job_id?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
        }
        Update: {
          block_id?: string | null
          crawl_job_id?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "content_embeddings_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "analyzed_content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_embeddings_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_embeddings_crawl_job_id_fkey"
            columns: ["crawl_job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_journeys: {
        Row: {
          block_id: string | null
          crawl_job_id: string | null
          created_at: string | null
          effectiveness_score: number | null
          id: string
          journey_stage: string
          persona: string
          stage_order: number | null
        }
        Insert: {
          block_id?: string | null
          crawl_job_id?: string | null
          created_at?: string | null
          effectiveness_score?: number | null
          id?: string
          journey_stage: string
          persona: string
          stage_order?: number | null
        }
        Update: {
          block_id?: string | null
          crawl_job_id?: string | null
          created_at?: string | null
          effectiveness_score?: number | null
          id?: string
          journey_stage?: string
          persona?: string
          stage_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_journeys_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "analyzed_content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_journeys_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_journeys_crawl_job_id_fkey"
            columns: ["crawl_job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_topics: {
        Row: {
          block_id: string | null
          confidence_score: number | null
          crawl_job_id: string | null
          created_at: string | null
          id: string
          key_themes: Json | null
          processing_status:
            | Database["public"]["Enums"]["processing_state"]
            | null
          topic_name: string
        }
        Insert: {
          block_id?: string | null
          confidence_score?: number | null
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string
          key_themes?: Json | null
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          topic_name: string
        }
        Update: {
          block_id?: string | null
          confidence_score?: number | null
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string
          key_themes?: Json | null
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          topic_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_topics_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "analyzed_content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_topics_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_topics_crawl_job_id_fkey"
            columns: ["crawl_job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      crawl_control_queue: {
        Row: {
          id: string
          job_id: string
          metadata: Json | null
          operation: Database["public"]["Enums"]["crawl_control_operation"]
          processed_at: string | null
          requested_at: string | null
          status: Database["public"]["Enums"]["processing_state"] | null
        }
        Insert: {
          id?: string
          job_id: string
          metadata?: Json | null
          operation: Database["public"]["Enums"]["crawl_control_operation"]
          processed_at?: string | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["processing_state"] | null
        }
        Update: {
          id?: string
          job_id?: string
          metadata?: Json | null
          operation?: Database["public"]["Enums"]["crawl_control_operation"]
          processed_at?: string | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["processing_state"] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_id"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      crawled_pages: {
        Row: {
          content_text: string | null
          crawl_job_id: string | null
          created_at: string | null
          depth: number
          extracted_content: Json | null
          id: string
          metadata: Json | null
          processing_status:
            | Database["public"]["Enums"]["processing_state"]
            | null
          title: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          content_text?: string | null
          crawl_job_id?: string | null
          created_at?: string | null
          depth: number
          extracted_content?: Json | null
          id?: string
          metadata?: Json | null
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          title?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          content_text?: string | null
          crawl_job_id?: string | null
          created_at?: string | null
          depth?: number
          extracted_content?: Json | null
          id?: string
          metadata?: Json | null
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          title?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "crawled_pages_crawl_job_id_fkey"
            columns: ["crawl_job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      crawler_data: {
        Row: {
          content: Json
          crawl_batch_id: string
          created_at: string
          id: number
          url: string
        }
        Insert: {
          content: Json
          crawl_batch_id: string
          created_at?: string
          id?: never
          url: string
        }
        Update: {
          content?: Json
          crawl_batch_id?: string
          created_at?: string
          id?: never
          url?: string
        }
        Relationships: []
      }
      crawler_logs: {
        Row: {
          crawl_job_id: string | null
          id: number
          level: Database["public"]["Enums"]["log_level"]
          message: string
          metadata: Json | null
          timestamp: string
        }
        Insert: {
          crawl_job_id?: string | null
          id?: never
          level: Database["public"]["Enums"]["log_level"]
          message: string
          metadata?: Json | null
          timestamp?: string
        }
        Update: {
          crawl_job_id?: string | null
          id?: never
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
          metadata?: Json | null
          timestamp?: string
        }
        Relationships: []
      }
      crawler_stats: {
        Row: {
          content_stats: Json
          crawl_job_id: string
          crawl_rate: number
          created_at: string
          duration_ms: number
          end_time: string
          error_rate: number
          failed_crawls: number
          id: number
          robots_txt_status: boolean
          start_time: string
          successful_crawls: number
          total_links_discovered: number
          total_pages_attempted: number
        }
        Insert: {
          content_stats: Json
          crawl_job_id: string
          crawl_rate: number
          created_at?: string
          duration_ms: number
          end_time: string
          error_rate: number
          failed_crawls: number
          id?: never
          robots_txt_status: boolean
          start_time: string
          successful_crawls: number
          total_links_discovered: number
          total_pages_attempted: number
        }
        Update: {
          content_stats?: Json
          crawl_job_id?: string
          crawl_rate?: number
          created_at?: string
          duration_ms?: number
          end_time?: string
          error_rate?: number
          failed_crawls?: number
          id?: never
          robots_txt_status?: boolean
          start_time?: string
          successful_crawls?: number
          total_links_discovered?: number
          total_pages_attempted?: number
        }
        Relationships: []
      }
      extracted_features: {
        Row: {
          block_id: string | null
          created_at: string | null
          id: string
          metadata_features: Json | null
          processing_status:
            | Database["public"]["Enums"]["processing_state"]
            | null
          semantic_features: Json | null
          structural_features: Json | null
          textual_features: Json | null
          updated_at: string | null
        }
        Insert: {
          block_id?: string | null
          created_at?: string | null
          id?: string
          metadata_features?: Json | null
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          semantic_features?: Json | null
          structural_features?: Json | null
          textual_features?: Json | null
          updated_at?: string | null
        }
        Update: {
          block_id?: string | null
          created_at?: string | null
          id?: string
          metadata_features?: Json | null
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          semantic_features?: Json | null
          structural_features?: Json | null
          textual_features?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_features_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "analyzed_content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_features_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      job_state_changes: {
        Row: {
          changed_at: string | null
          id: string
          job_id: string
          metadata: Json | null
          new_state: Database["public"]["Enums"]["processing_state"]
          previous_state: Database["public"]["Enums"]["processing_state"] | null
          reason: string | null
        }
        Insert: {
          changed_at?: string | null
          id?: string
          job_id: string
          metadata?: Json | null
          new_state: Database["public"]["Enums"]["processing_state"]
          previous_state?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          reason?: string | null
        }
        Update: {
          changed_at?: string | null
          id?: string
          job_id?: string
          metadata?: Json | null
          new_state?: Database["public"]["Enums"]["processing_state"]
          previous_state?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_id"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      page_links: {
        Row: {
          crawl_job_id: string | null
          created_at: string | null
          id: string
          relationship_type: string | null
          source_page_id: string | null
          target_url: string
        }
        Insert: {
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string
          relationship_type?: string | null
          source_page_id?: string | null
          target_url: string
        }
        Update: {
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string
          relationship_type?: string | null
          source_page_id?: string | null
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_links_crawl_job_id_fkey"
            columns: ["crawl_job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_links_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "crawled_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_content_mapping: {
        Row: {
          block_id: string | null
          content_category: string | null
          crawl_job_id: string | null
          created_at: string | null
          id: string
          marketing_suggestions: string | null
          persona: string
          relevance_score: number | null
        }
        Insert: {
          block_id?: string | null
          content_category?: string | null
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string
          marketing_suggestions?: string | null
          persona: string
          relevance_score?: number | null
        }
        Update: {
          block_id?: string | null
          content_category?: string | null
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string
          marketing_suggestions?: string | null
          persona?: string
          relevance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "persona_content_mapping_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "analyzed_content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_content_mapping_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_content_mapping_crawl_job_id_fkey"
            columns: ["crawl_job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_optimized_content: {
        Row: {
          block_id: string
          crawl_job_id: string
          created_at: string | null
          cta_text: string
          description: string
          id: string
          journey_stage: string
          optimized_content: string
          original_block_content: string
          persona_mapping_id: string
          relevance_score: number
          technical_level: number
          title: string
          transformation_rationale: string | null
          updated_at: string | null
        }
        Insert: {
          block_id: string
          crawl_job_id: string
          created_at?: string | null
          cta_text: string
          description: string
          id?: string
          journey_stage: string
          optimized_content: string
          original_block_content: string
          persona_mapping_id: string
          relevance_score: number
          technical_level: number
          title: string
          transformation_rationale?: string | null
          updated_at?: string | null
        }
        Update: {
          block_id?: string
          crawl_job_id?: string
          created_at?: string | null
          cta_text?: string
          description?: string
          id?: string
          journey_stage?: string
          optimized_content?: string
          original_block_content?: string
          persona_mapping_id?: string
          relevance_score?: number
          technical_level?: number
          title?: string
          transformation_rationale?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persona_optimized_content_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "analyzed_content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_optimized_content_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "content_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_optimized_content_crawl_job_id_fkey"
            columns: ["crawl_job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_optimized_content_persona_mapping_id_fkey"
            columns: ["persona_mapping_id"]
            isOneToOne: true
            referencedRelation: "persona_content_mapping"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_metrics: {
        Row: {
          created_at: string | null
          id: string
          job_id: string
          metric_name: string
          metric_type: Database["public"]["Enums"]["metric_type"]
          metric_value: number
          tags: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_id: string
          metric_name: string
          metric_type: Database["public"]["Enums"]["metric_type"]
          metric_value: number
          tags?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          job_id?: string
          metric_name?: string
          metric_type?: Database["public"]["Enums"]["metric_type"]
          metric_value?: number
          tags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_id"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_relations: {
        Row: {
          crawl_job_id: string | null
          created_at: string | null
          id: string
          processing_status:
            | Database["public"]["Enums"]["processing_state"]
            | null
          relation_type: string | null
          source_topic_id: string | null
          strength: number | null
          target_topic_id: string | null
        }
        Insert: {
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          relation_type?: string | null
          source_topic_id?: string | null
          strength?: number | null
          target_topic_id?: string | null
        }
        Update: {
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          relation_type?: string | null
          source_topic_id?: string | null
          strength?: number | null
          target_topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_relations_crawl_job_id_fkey"
            columns: ["crawl_job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_relations_source_topic_id_fkey"
            columns: ["source_topic_id"]
            isOneToOne: false
            referencedRelation: "content_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_relations_target_topic_id_fkey"
            columns: ["target_topic_id"]
            isOneToOne: false
            referencedRelation: "content_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      web_crawl_jobs: {
        Row: {
          completed_at: string | null
          config: Json | null
          created_at: string | null
          id: string
          last_processed_url: string | null
          max_depth: number
          metrics_summary: Json | null
          pause_requested_at: string | null
          processing_stats: Json | null
          resumed_at: string | null
          start_url: string
          status: string
          stop_requested_at: string | null
          total_pages_crawled: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string
          last_processed_url?: string | null
          max_depth: number
          metrics_summary?: Json | null
          pause_requested_at?: string | null
          processing_stats?: Json | null
          resumed_at?: string | null
          start_url: string
          status: string
          stop_requested_at?: string | null
          total_pages_crawled?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string
          last_processed_url?: string | null
          max_depth?: number
          metrics_summary?: Json | null
          pause_requested_at?: string | null
          processing_stats?: Json | null
          resumed_at?: string | null
          start_url?: string
          status?: string
          stop_requested_at?: string | null
          total_pages_crawled?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      analyzed_content_blocks: {
        Row: {
          avg_sentence_length: string | null
          avg_word_length: string | null
          block_type: string | null
          complexity_score: number | null
          content: string | null
          crawl_job_id: string | null
          created_at: string | null
          id: string | null
          language_level: string | null
          lexical_diversity: string | null
          page_id: string | null
          processing_status:
            | Database["public"]["Enums"]["processing_state"]
            | null
          sentence_count: string | null
          total_tokens: number | null
          word_count: string | null
        }
        Insert: {
          avg_sentence_length?: never
          avg_word_length?: never
          block_type?: string | null
          complexity_score?: number | null
          content?: string | null
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string | null
          language_level?: never
          lexical_diversity?: never
          page_id?: string | null
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          sentence_count?: never
          total_tokens?: number | null
          word_count?: never
        }
        Update: {
          avg_sentence_length?: never
          avg_word_length?: never
          block_type?: string | null
          complexity_score?: number | null
          content?: string | null
          crawl_job_id?: string | null
          created_at?: string | null
          id?: string | null
          language_level?: never
          lexical_diversity?: never
          page_id?: string | null
          processing_status?:
            | Database["public"]["Enums"]["processing_state"]
            | null
          sentence_count?: never
          total_tokens?: number | null
          word_count?: never
        }
        Relationships: [
          {
            foreignKeyName: "content_blocks_crawl_job_id_fkey"
            columns: ["crawl_job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_blocks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "crawled_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      recent_metrics: {
        Row: {
          created_at: string | null
          job_id: string | null
          job_status: string | null
          metric_name: string | null
          metric_type: Database["public"]["Enums"]["metric_type"] | null
          metric_value: number | null
          tags: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_id"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "web_crawl_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      aggregate_metrics: {
        Args: {
          p_job_id: string
          p_period: string
          p_start: string
          p_end: string
        }
        Returns: undefined
      }
      fetch_content_by_persona:
        | {
            Args: Record<PropertyKey, never>
            Returns: Json
          }
        | {
            Args: {
              p_technical_level?: number
            }
            Returns: Json
          }
      get_content_by_language_level: {
        Args: {
          job_id: string
          level: Database["public"]["Enums"]["content_language_level"]
        }
        Returns: {
          id: string
          content: string
          complexity_score: number
          readability_metrics: Json
        }[]
      }
      jsonb_deep_merge: {
        Args: {
          current: Json
          new: Json
        }
        Returns: Json
      }
      match_embeddings:
        | {
            Args: {
              query_embedding: string
              job_id: string
              match_threshold: number
              match_count: number
            }
            Returns: {
              block_id: string
              content: string
              similarity: number
            }[]
          }
        | {
            Args: {
              query_embedding: string
              match_threshold: number
              match_count: number
              p_job_id: string
            }
            Returns: {
              block_id: string
              content: string
              similarity: number
            }[]
          }
      process_crawled_pages_queue: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      categorization_event:
        | "chunk_processed"
        | "page_completed"
        | "consolidation_started"
        | "consolidation_completed"
        | "error"
      chunk_event:
        | "section_processed"
        | "chunk_created"
        | "validation_failed"
        | "chunk_saved"
        | "error"
      content_language_level: "basic" | "intermediate" | "advanced"
      content_persona: "expert" | "educator" | "newcomer"
      crawl_control_operation: "pause" | "resume" | "stop" | "restart"
      log_level: "debug" | "info" | "warn" | "error"
      metric_type:
        | "crawl_performance"
        | "resource_usage"
        | "queue_stats"
        | "network_performance"
        | "memory_usage"
      processing_state:
        | "pending"
        | "active"
        | "completed"
        | "failed"
        | "paused"
        | "stopping"
      source_type:
        | "heading"
        | "paragraph"
        | "list"
        | "link"
        | "table"
        | "heading_h1"
        | "heading_h2"
        | "heading_h3"
        | "heading_h4"
        | "heading_h5"
        | "heading_h6"
        | "list_ordered"
        | "list_unordered"
        | "list_definition"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
