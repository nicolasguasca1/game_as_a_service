import Layout from "@/components/sites/Layout";
import Link from "next/link";
import Tweet from "@/components/mdx/Tweet";
import matter from "gray-matter";
import remark from "remark";
import html from "remark-html";
import { serialize } from "next-mdx-remote/serialize";
import { MDXRemote } from "next-mdx-remote";
import BlurImage from "@/components/BlurImage";
import BlogCard from "@/components/BlogCard";
import Examples from "@/components/mdx/Examples";
import Date from "@/components/Date";
import prisma from "@/lib/prisma";
import { getTweets } from "@/lib/twitter";
import { useRouter } from "next/router";
import Loader from "@/components/sites/Loader";

import type { AdjacentPost, Meta, _SiteSlugData } from "@/types";
import type { GetStaticPaths, GetStaticPropsContext } from "next";
import type { MDXRemoteSerializeResult } from "next-mdx-remote";
import type { ParsedUrlQuery } from "querystring";

const components = {
  Tweet,
  Link,
  BlurImage,
  Examples
};

interface PathProps extends ParsedUrlQuery {
  site: string;
  slug: string;
}

interface PostProps {
  stringifiedData: string;
  stringifiedAdjacentPosts: string;
}

export default function Post({
  stringifiedAdjacentPosts,
  stringifiedData
}: PostProps) {
  const router = useRouter();
  if (router.isFallback) return <Loader />;

  const data = JSON.parse(stringifiedData) as _SiteSlugData & {
    mdxSource: MDXRemoteSerializeResult<Record<string, unknown>>;
  };
  const adjacentPosts = JSON.parse(
    stringifiedAdjacentPosts
  ) as Array<AdjacentPost>;

  const meta = {
    title: data.title,
    description: data.description,
    ogUrl: `https://${data.site?.subdomain}.vercel.pub/${data.slug}`,
    ogImage: data.image,
    logo: "/logo.png"
  } as Meta;

  return (
    <Layout meta={meta} subdomain={data.site?.subdomain}>
      <div className="flex flex-col justify-center items-center">
        <div className="text-center w-full md:w-7/12 m-auto">
          <p className="text-sm md:text-base font-light text-gray-500 w-10/12 m-auto my-5">
            <Date dateString={data.createdAt.toString()} />
          </p>
          <h1 className="font-bold text-3xl font-cal md:text-6xl mb-10 text-gray-800">
            {data.title}
          </h1>
          <p className="text-md md:text-lg text-gray-600 w-10/12 m-auto">
            {data.description}
          </p>
        </div>
        <a
          target="_blank"
          href={`https://twitter.com/${data.site?.user?.username}`}
        >
          <div className="my-8">
            <div className="relative w-8 h-8 md:w-12 md:h-12 rounded-full overflow-hidden inline-block align-middle">
              {data.site?.user?.image ? (
                <BlurImage
                  alt={data.site?.user?.name ?? "User Avatar"}
                  height={80}
                  src={data.site.user.image}
                  width={80}
                />
              ) : (
                <div className="absolute flex items-center justify-center w-full h-full bg-gray-100 text-gray-500 text-4xl select-none">
                  ?
                </div>
              )}
            </div>
            <div className="inline-block text-md md:text-lg align-middle ml-3">
              by <span className="font-semibold">{data.site?.user?.name}</span>
            </div>
          </div>
        </a>
      </div>
      <div className="relative h-80 md:h-150 w-full max-w-screen-lg lg:2/3 md:w-5/6 m-auto mb-10 md:mb-20 md:rounded-2xl overflow-hidden">
        {data.image ? (
          <BlurImage
            alt={data.title ?? "Post image"}
            layout="fill"
            objectFit="cover"
            placeholder="blur"
            blurDataURL={data.imageBlurhash ?? undefined}
            src={data.image}
          />
        ) : (
          <div className="absolute flex items-center justify-center w-full h-full bg-gray-100 text-gray-500 text-4xl select-none">
            ?
          </div>
        )}
      </div>

      <article className="w-11/12 sm:w-3/4 m-auto prose prose-md sm:prose-lg">
        <MDXRemote {...data.mdxSource} components={components} />
      </article>

      {adjacentPosts.length > 0 && (
        <div className="relative mt-10 sm:mt-20 mb-20">
          <div
            className="absolute inset-0 flex items-center"
            aria-hidden="true"
          >
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-2 bg-white text-sm text-gray-500">
              Continue Reading
            </span>
          </div>
        </div>
      )}
      {adjacentPosts && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-8 mx-5 lg:mx-12 2xl:mx-auto mb-20 max-w-screen-xl">
          {adjacentPosts.map((data, index) => (
            <BlogCard key={index} data={data} />
          ))}
        </div>
      )}
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths<PathProps> = async () => {
  const posts = await prisma.post.findMany({
    where: {
      published: true
    },
    select: {
      slug: true,
      site: {
        select: {
          subdomain: true,
          customDomain: true
        }
      }
    },
    take: 80,
    orderBy: {
      createdAt: "asc"
    }
  });

  return {
    paths: posts.flatMap((post) => {
      if (post.site === null || post.site.subdomain === null) return [];

      if (post.site.customDomain) {
        return [
          {
            params: {
              site: post.site.customDomain,
              slug: post.slug
            }
          },
          {
            params: {
              site: post.site.subdomain,
              slug: post.slug
            }
          }
        ];
      } else {
        return {
          params: {
            site: post.site.subdomain,
            slug: post.slug
          }
        };
      }
    }),
    fallback: true
  };
};

export async function getStaticProps({
  params
}: GetStaticPropsContext<PathProps>) {
  if (!params) throw new Error("No path parameters found");

  const { site, slug } = params;

  const constraint = {
    site: {
      customDomain: site.includes(".") ? site : undefined,
      subdomain: site
    }
  };

  const data = (await prisma.post.findFirst({
    where: {
      ...constraint,
      slug
    },
    include: {
      site: {
        include: {
          user: true
        }
      }
    }
  })) as _SiteSlugData | null;

  if (!data) return { notFound: true, revalidate: 10 };

  const [mdxSource, adjacentPosts] = await Promise.all([
    getMdxSource(data.content!),
    prisma.post.findMany({
      where: {
        ...constraint,
        published: true,
        NOT: {
          id: data.id
        }
      },
      select: {
        slug: true,
        title: true,
        createdAt: true,
        description: true,
        image: true,
        imageBlurhash: true
      }
    })
  ]);

  return {
    props: {
      stringifiedData: JSON.stringify({
        ...data,
        mdxSource
      }),
      stringifiedAdjacentPosts: JSON.stringify(adjacentPosts)
    },
    revalidate: 10
  };
}

async function getMdxSource(postContents: string) {
  // Use gray-matter to parse the post metadata section
  const { content, data } = matter(postContents);

  // Use remark to convert markdown into HTML string
  const processedContent = await remark().use(html).process(content);

  // Convert converted html to string format
  const contentHtml = processedContent.toString();

  // replace all external links
  const replacedExternalLinks = contentHtml.replace(
    /<a (href="http(s)?.+?")>(.+?)(?=<\/a>)/g,
    `<a target="_blank" $1>$3 ↗`
  );

  // replace all internal links
  const replacedInternalLinks = replacedExternalLinks.replace(
    /<a href="\/(.+?)">(.+?)<\/a>/g,
    `<Link href="/$1"><a className="cursor-pointer">$2</a></Link>`
  );

  // replace all Examples
  const replacedExamples = await replaceAsync(
    replacedInternalLinks,
    /<Examples (.*)\/>/g,
    getExamples
  );

  // Replace all Twitter URLs with their MDX counterparts
  const replacedTweets = await replaceAsync(
    replacedExamples,
    /<p>(https?:\/\/twitter\.com\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)([^\?])(\?.*)?<\/p>)/g,
    getTweetMetadata
  );

  // serialize the content string into MDX
  const mdxSource = await serialize(replacedTweets);

  return mdxSource;
}

// TODO: Validate TypeScript migration did not modify the functionality
const replaceAsync = async (
  str: string,
  regex: RegExp,
  asyncFn: (str: string) => Promise<string>
): Promise<string> => {
  const matches = new Array<string>();

  str.replace(regex, (match) => {
    matches.push(match);
    return match;
  });

  const data = await Promise.all(matches.map((match) => asyncFn(match)));

  return str.replace(regex, () => {
    const str = data.shift();
    if (!str) throw new Error("Unable to shift string from promised data");

    return str;
  });
};

const getTweetMetadata = async (tweetUrl: string): Promise<string> => {
  const regex = /\/status\/(\d+)/gm;

  const id = regex.exec(tweetUrl);
  if (!id)
    throw new Error("Regex pattern failed to find Twitter metadata to replace");

  const tweetData = await getTweets(id[1]);

  return (
    "<Tweet id='" + id + "' metadata={`" + JSON.stringify(tweetData) + "`}/>"
  );
};

const getExamples = async (str: string): Promise<string> => {
  const regex = /names=\[(.+)\]/gm;

  const raw = regex.exec(str);
  if (!raw) throw new Error("Regex pattern failed to find examples to replace");

  const names = raw[1].split(",");

  let data = [];

  for (let i = 0; i < names.length; i++) {
    const results = await prisma.example.findUnique({
      where: {
        id: parseInt(names[i])
      }
    });
    data.push(results);
  }

  return `<Examples data={${JSON.stringify(data)}} />`;
};
